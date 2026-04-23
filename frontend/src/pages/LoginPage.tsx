import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../lib/http";

const cardTransition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const
};

type Mode = "login" | "signup";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(orgName, email, password, displayName);
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === "invalid_credentials") {
          setError("Incorrect email or password.");
        } else if (err.code === "user_exists") {
          setError("An account with this email already exists.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={cardTransition}
        className="solid-card w-full max-w-[440px] p-10 md:p-12"
      >
        <div className="text-center">
          <p className="font-sans text-label font-semibold uppercase text-text2">Orchestra</p>
          <h1 className="mt-3 font-sans text-[28px] font-bold leading-tight tracking-tight text-text1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-2 font-sans text-docSm text-text2">Your product brain.</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-10 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="mb-1 block font-sans text-label font-semibold uppercase text-text2">
                  Organisation name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Corp"
                  className="h-[48px] w-full rounded-lg border border-border bg-white px-4 font-sans text-[14px] text-text1 outline-none focus:border-text1"
                />
              </div>
              <div>
                <label className="mb-1 block font-sans text-label font-semibold uppercase text-text2">
                  Your name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                  className="h-[48px] w-full rounded-lg border border-border bg-white px-4 font-sans text-[14px] text-text1 outline-none focus:border-text1"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block font-sans text-label font-semibold uppercase text-text2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-[48px] w-full rounded-lg border border-border bg-white px-4 font-sans text-[14px] text-text1 outline-none focus:border-text1"
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-label font-semibold uppercase text-text2">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="h-[48px] w-full rounded-lg border border-border bg-white px-4 font-sans text-[14px] text-text1 outline-none focus:border-text1"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-sans text-[13px] text-red-700">
              {error}
            </p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.99 }}
            className="mt-2 flex h-[48px] w-full items-center justify-center rounded-lg bg-text1 font-sans text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </motion.button>
        </form>

        <p className="mt-6 text-center font-sans text-docSm text-text2">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); }}
                className="font-semibold text-text1 underline underline-offset-2"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); }}
                className="font-semibold text-text1 underline underline-offset-2"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </motion.section>
    </main>
  );
}
