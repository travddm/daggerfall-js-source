using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .pgWorker),
    (name = "net", network = (allow = ["public", "private", "local"])),
  ],
  sockets = [ (name = "http", address = "127.0.0.1:58787", http = (), service = "main") ],
);

const pgWorker :Workerd.Worker = (
  modules = [ (name = "worker.js", esModule = embed "worker.js") ],
  compatibilityDate = "2026-09-01",
  compatibilityFlags = ["nodejs_compat"],
  globalOutbound = "net",
  bindings = [ (name = "PG_URL", text = "postgres://postgres@127.0.0.1:55432/postgres") ],
);
