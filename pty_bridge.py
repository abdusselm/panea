#!/usr/bin/env python3
"""PTY bridge for panea.

Node spawns one of these per terminal pane. We allocate a real PTY with the
standard library `pty` module (backed by libutil openpty) so there is NO
separate unsigned helper binary to exec -- the only executable involved is the
Apple-signed system python3. That keeps us clear of managed-device code-signing
enforcement (Gatekeeper / EDR), which blocks unsigned native binaries.

Wiring (all fds inherited from the Node parent):
  fd 0  stdin   raw keystrokes from the browser  -> write to pty master
  fd 1  stdout  raw pty output                    -> forwarded to the browser
  fd 3  control newline-delimited JSON commands   -> {"t":"resize","cols","rows"}

Args: pty_bridge.py <shell> [--cwd DIR] [--cols N] [--rows N] [-- arg ...]
"""
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_winsize(fd, rows, cols):
    try:
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        pass


def parse_args(argv):
    shell = argv[0] if argv else os.environ.get("SHELL", "/bin/zsh")
    cwd = None
    cols, rows = 80, 24
    extra = []
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--cwd" and i + 1 < len(argv):
            cwd = argv[i + 1]; i += 2
        elif a == "--cols" and i + 1 < len(argv):
            cols = int(argv[i + 1]); i += 2
        elif a == "--rows" and i + 1 < len(argv):
            rows = int(argv[i + 1]); i += 2
        elif a == "--":
            extra = argv[i + 1:]; break
        else:
            i += 1
    return shell, cwd, cols, rows, extra


def main():
    shell, cwd, cols, rows, extra = parse_args(sys.argv[1:])

    pid, master_fd = pty.fork()
    if pid == 0:
        # Child: become the shell.
        if cwd and os.path.isdir(cwd):
            try:
                os.chdir(cwd)
            except OSError:
                pass
        os.environ["TERM"] = "xterm-256color"
        os.environ["PANEA"] = "1"
        # Login + interactive shell so profiles load and TUIs (vim, agents) work.
        args = [shell, "-l"] + extra if not extra else [shell] + extra
        try:
            os.execvp(shell, args)
        except OSError:
            os.execvp("/bin/sh", ["/bin/sh"])
        os._exit(127)

    # Parent: relay loop.
    set_winsize(master_fd, rows, cols)

    stdin_fd = 0
    stdout_fd = 1
    control_fd = 3
    control_buf = b""

    # Non-blocking master reads.
    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    has_control = True
    try:
        os.fstat(control_fd)
    except OSError:
        has_control = False

    watch = [master_fd, stdin_fd] + ([control_fd] if has_control else [])

    def cleanup(*_):
        try:
            os.close(master_fd)
        except OSError:
            pass
    signal.signal(signal.SIGTERM, lambda *_: (cleanup(), sys.exit(0)))

    while True:
        try:
            readable, _, _ = select.select(watch, [], [], 30)
        except (InterruptedError, OSError):
            continue

        if master_fd in readable:
            try:
                data = os.read(master_fd, 65536)
            except OSError:
                data = b""
            if not data:
                break
            try:
                os.write(stdout_fd, data)
            except OSError:
                break

        if stdin_fd in readable:
            try:
                data = os.read(stdin_fd, 65536)
            except OSError:
                data = b""
            if not data:
                # Browser side closed. Send EOF to the child then keep draining.
                watch = [fd for fd in watch if fd != stdin_fd]
            else:
                try:
                    os.write(master_fd, data)
                except OSError:
                    break

        if has_control and control_fd in readable:
            try:
                chunk = os.read(control_fd, 4096)
            except OSError:
                chunk = b""
            if not chunk:
                watch = [fd for fd in watch if fd != control_fd]
                has_control = False
            else:
                control_buf += chunk
                while b"\n" in control_buf:
                    line, control_buf = control_buf.split(b"\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except ValueError:
                        continue
                    if msg.get("t") == "resize":
                        set_winsize(master_fd, int(msg.get("rows", rows)), int(msg.get("cols", cols)))

    # Reap child.
    try:
        _, status = os.waitpid(pid, 0)
        code = os.waitstatus_to_exitcode(status)
    except (ChildProcessError, OSError):
        code = 0
    # Emit exit code on the control fd is not reliable; Node detects process exit.
    sys.exit(code if isinstance(code, int) and code >= 0 else 0)


if __name__ == "__main__":
    main()
