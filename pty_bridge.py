#!/usr/bin/env python3
import fcntl
import json
import os
import pty
import select
import signal
import errno
import struct
import sys
import termios
import time

RETRY = (errno.EINTR, errno.EAGAIN, errno.EWOULDBLOCK)
MAX_PENDING = 1 << 20

def read_fd(fd, size):
    try:
        return os.read(fd, size), None
    except OSError as exc:
        return b"", "retry" if exc.errno in RETRY else "closed"

def drain_fd(fd, data):
    view = memoryview(data)
    while view:
        try:
            written = os.write(fd, view)
        except OSError as exc:
            if exc.errno in RETRY:
                break
            return b"", "closed"
        if not written:
            break
        view = view[written:]
    return bytes(view), None

def terminate(pid, master_fd):
    try:
        os.close(master_fd)
    except OSError:
        pass
    try:
        os.kill(pid, signal.SIGHUP)
    except OSError:
        return None
    deadline = time.time() + 2.0
    while time.time() < deadline:
        try:
            done, status = os.waitpid(pid, os.WNOHANG)
        except (ChildProcessError, OSError):
            return None
        if done:
            return status
        time.sleep(0.05)
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        _, status = os.waitpid(pid, 0)
        return status
    except (ChildProcessError, OSError):
        return None

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
        if cwd and os.path.isdir(cwd):
            try:
                os.chdir(cwd)
            except OSError:
                pass
        os.environ["TERM"] = "xterm-256color"
        os.environ["PANEA"] = "1"
        args = [shell, "-l"] + extra if not extra else [shell] + extra
        try:
            os.execvp(shell, args)
        except OSError:
            os.execvp("/bin/sh", ["/bin/sh"])
        os._exit(127)

    set_winsize(master_fd, rows, cols)

    stdin_fd = 0
    stdout_fd = 1
    control_fd = 3
    control_buf = b""

    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    has_control = True
    try:
        os.fstat(control_fd)
    except OSError:
        has_control = False

    def on_signal(*_):
        terminate(pid, master_fd)
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGHUP, on_signal)

    to_shell = b""
    to_client = b""

    while True:
        watch = []
        if len(to_client) < MAX_PENDING:
            watch.append(master_fd)
        if len(to_shell) < MAX_PENDING:
            watch.append(stdin_fd)
        if has_control:
            watch.append(control_fd)

        drainable = []
        if to_shell:
            drainable.append(master_fd)
        if to_client:
            drainable.append(stdout_fd)

        try:
            readable, writable, _ = select.select(watch, drainable, [], 30)
        except (InterruptedError, OSError):
            continue

        if master_fd in readable:
            data, problem = read_fd(master_fd, 65536)
            if problem != "retry":
                if not data:
                    break
                to_client += data

        if stdin_fd in readable:
            data, problem = read_fd(stdin_fd, 65536)
            if problem != "retry":
                if not data:
                    break
                to_shell += data

        if to_shell and master_fd in writable:
            to_shell, problem = drain_fd(master_fd, to_shell)
            if problem:
                break

        if to_client and stdout_fd in writable:
            to_client, problem = drain_fd(stdout_fd, to_client)
            if problem:
                break

        if has_control and control_fd in readable:
            chunk, problem = read_fd(control_fd, 4096)
            if problem == "retry":
                pass
            elif not chunk:
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

    deadline = time.time() + 1.0
    while to_client and time.time() < deadline:
        try:
            select.select([], [stdout_fd], [], 0.1)
        except (InterruptedError, OSError):
            break
        to_client, problem = drain_fd(stdout_fd, to_client)
        if problem:
            break

    status = terminate(pid, master_fd)
    if status is None:
        sys.exit(0)
    try:
        code = os.waitstatus_to_exitcode(status)
    except ValueError:
        code = 0
    sys.exit(code if isinstance(code, int) and code >= 0 else 0)

if __name__ == "__main__":
    main()
