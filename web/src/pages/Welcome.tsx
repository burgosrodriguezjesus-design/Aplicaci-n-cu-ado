import { useState, type FormEvent } from "react";
import { CakeSlice, Check, Link2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input } from "../components/ui";

/** Primera vez en este dispositivo: crear su pastelería o abrir una que ya tiene. */
export function Welcome() {
  const { refresh, linkError } = useAuth();
  const [mode, setMode] = useState<"create" | "link">(
    linkError ? "link" : "create",
  );
  const [f, setF] = useState({ business_name: "", name: "" });
  const [key, setKey] = useState("");
  const [error, setError] = useState(linkError);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("/auth/create", { method: "POST", body: f }));
  };
  const enter = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("/auth/enter", { method: "POST", body: { key } }));
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr] bg-cream-100">
      {/* Presentación */}
      <div className="hero relative overflow-hidden text-white px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-24 lg:p-14 lg:flex lg:flex-col">
        <div className="absolute inset-0 hero-dots pointer-events-none" />
        <div className="absolute -right-24 -bottom-24 h-80 w-80 rounded-full border border-white/10 pointer-events-none" />
        <div className="absolute -right-10 -bottom-10 h-52 w-52 rounded-full border border-white/10 pointer-events-none" />
        <div className="relative flex items-center gap-2.5">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-berry-500 to-berry-700 flex items-center justify-center shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)]">
            <CakeSlice size={20} strokeWidth={1.75} />
          </span>
          <span className="font-display text-xl">Obrador</span>
        </div>
        <div className="relative mt-10 lg:mt-auto lg:mb-auto max-w-md">
          <h1 className="font-display text-[40px] lg:text-[56px] leading-[1.02] font-normal">
            Tu obrador,
            <br />
            <span className="text-berry-200">en orden.</span>
          </h1>
          <p className="mt-4 text-white/70 text-[15px] leading-relaxed">
            Pedidos, producción, recetas, inventario y finanzas de tu pastelería
            en un solo sitio. Sin registro ni contraseña.
          </p>
          <ul className="hidden lg:grid mt-8 gap-3 text-sm text-white/75">
            {[
              "Calendario y producción del día",
              "Lista de la compra automática",
              "Costes, márgenes y beneficio",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="h-5 w-5 rounded-full glass flex items-center justify-center">
                  <Check size={12} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Formulario */}
      <div className="relative -mt-14 lg:mt-0 px-4 pb-10 lg:p-14 flex items-start lg:items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="hidden lg:block mb-6">
            <h2 className="font-display text-[30px] text-choco-900">
              {mode === "create" ? "Crea tu pastelería" : "Abrir mi pastelería"}
            </h2>
            <p className="text-sm text-choco-500 mt-1">
              {mode === "create"
                ? "Tarda menos de un minuto."
                : "Pega el enlace de acceso que guardaste."}
            </p>
          </div>
          <div className="card p-5 lg:p-6 shadow-[var(--shadow-lift)]">
            <h2 className="lg:hidden font-display text-[22px] text-choco-900 mb-4">
              {mode === "create" ? "Crea tu pastelería" : "Abrir mi pastelería"}
            </h2>
            {mode === "create" ? (
              <form onSubmit={create} className="space-y-4">
                <Field label="Nombre de tu pastelería">
                  <Input
                    value={f.business_name}
                    onChange={(e) =>
                      setF({ ...f, business_name: e.target.value })
                    }
                    placeholder="Ej. Dulces de Ana"
                    autoFocus
                  />
                </Field>
                <Field label="Tu nombre" hint="Opcional.">
                  <Input
                    value={f.name}
                    onChange={(e) => setF({ ...f, name: e.target.value })}
                    placeholder="Ej. Ana"
                  />
                </Field>
                {error && (
                  <p className="text-red-600 font-semibold text-sm">{error}</p>
                )}
                <Button
                  type="submit"
                  variant="accent"
                  block
                  size="lg"
                  loading={loading}
                  disabled={!f.business_name.trim()}
                >
                  Empezar
                </Button>
              </form>
            ) : (
              <form onSubmit={enter} className="space-y-4">
                <Field
                  label="Enlace de acceso"
                  hint="Lo encuentras en Configuración → «Usarla en otro móvil u ordenador» del dispositivo donde ya la usas."
                >
                  <Input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="https://…/entrar#…"
                    autoCapitalize="none"
                    autoFocus
                  />
                </Field>
                {error && (
                  <p className="text-red-600 font-semibold text-sm">{error}</p>
                )}
                <Button
                  type="submit"
                  block
                  size="lg"
                  loading={loading}
                  disabled={!key.trim()}
                >
                  Abrir
                </Button>
              </form>
            )}
          </div>
          <button
            type="button"
            className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-medium text-choco-500 hover:text-choco-900"
            onClick={() => {
              setMode(mode === "create" ? "link" : "create");
              setError("");
            }}
          >
            {mode === "create" ? (
              <>
                <Link2 size={15} /> Ya tengo una pastelería en otro dispositivo
              </>
            ) : (
              "Crear una pastelería nueva"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
