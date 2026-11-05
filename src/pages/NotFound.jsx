import { ArrowLink } from "../components/ui.jsx";
export default function NotFound() {
  return <section className="wrap section not-found" aria-labelledby="not-found-title">
    <p className="not-found-code">404</p>
    <h1 className="display" id="not-found-title">A little offside.</h1>
    <p>We couldn’t find this page.</p>
    <div className="not-found-links"><ArrowLink href="/">Back home</ArrowLink><ArrowLink href="/programme/">Explore the programme</ArrowLink></div>
  </section>;
}
