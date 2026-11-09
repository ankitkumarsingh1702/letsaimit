# LetsAimIt project agreements

These instructions apply to this repository. Keep its skills and working
agreements here; do not install them into global Codex settings or skills.

## Brand and sign-in identity

- The public product and Google OAuth app name is **LetsAimIt** in every
  environment. Do not add “UAT”, “prod”, “demo” or “preview” to that public name.
- Public app homepage: `https://letsaimit.com`.
- Public privacy policy: `https://letsaimit.com/privacy/`.
- Public terms: `https://letsaimit.com/terms/`.
- Share the branding and configuration template across environments. Reuse an
  OAuth client only within the provider's permitted scope. Google's
  [environment separation policy](https://developers.google.com/identity/verification/authentication-policy-compliance#use-separate-projects-for-testing-and-production)
  requires separate testing/production projects and keeps testing endpoints out
  of production clients. Use the necessary internal clients with the same
  public name **LetsAimIt**. Keep credentials in provider settings.
- Prepare both target configurations together within the authorized scope;
  record what is actually configured and verified. Production promotion
  carries the existing brand design rather than commissioning another one.
  Do not promise automatic Google brand approval or a free custom auth domain.
  Internal resource names may identify their environment without becoming the
  public app name.

## Release routing and parity

For release work, use the repository skill at
[.agents/skills/letsaimit-release/SKILL.md](.agents/skills/letsaimit-release/SKILL.md)
and the current evidence in [docs/RELEASE-PARITY.md](docs/RELEASE-PARITY.md).

- **“merge and deploy” means UAT**: branch `uat`, website
  `https://uat.letsaimit.com`. It does not authorize a merge to `main`, a
  production promotion, or production backend changes.
- **“merge and deploy to prod” is the explicit production trigger**. Promote
  the tested UAT source and its complete feature, migration and test set;
  do not independently reimplement the changes on production.
- A production build uses production configuration from the same tested
  source. A UAT bundle may contain an inlined UAT backend URL and is not
  automatically safe to alias to the production domain.
- Keep database targets, secrets, registration data and test rows separate.
  A Git/Vercel deployment does not establish that database migrations,
  OAuth callbacks, grants or production environment variables are ready.
- Record actual source SHAs and target verification. Mark missing production
  setup as pending; do not report feature parity from source inspection alone.

Keep the existing React/Vite, Supabase and Google identity flow. A source ZIP
may supply presentation changes; preserve working backend integrations when
the ZIP contains older or demo code. Release work does not authorize extra
product processing or AI stages.
