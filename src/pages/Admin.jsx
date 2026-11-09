import { useEffect, useState } from "react";

export default function Admin() {
  const [Register, setRegister] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    import("../features/admin/AdminPage.jsx")
      .then(module => { if (mounted) setRegister(() => module.default); })
      .catch(() => { if (mounted) setFailed(true); });
    return () => { mounted = false; };
  }, []);
  if (Register) return <Register />;
  return <section className="section" aria-live="polite">
    <h1>Registration register</h1>
    <p>{failed ? "The register could not open. Please reload and try again." : "Opening the register…"}</p>
  </section>;
}
