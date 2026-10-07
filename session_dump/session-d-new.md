Production is now a normal environment you can pick and scan. Each portal can have production, staging and sandbox at once, and a settings page adds or revokes them. All tests pass (crawler 1350 including the quality gates, chat 213, dashboard all). It's committed on feature/011-r31-portal-onboarding (b591f53), not pushed or merged. I haven't run a real production scan through the chat yet.

What changed:
- Production may write: a production environment is no longer read-only by rule. You set how far the crawler may go on each environment, and on production that includes submitting forms and logging in, on the live site. I amended the constitution to 4.0.0 for this and dropped the robots/terms review check. Three production rules stay: a CAPTCHA stops the run, a low request rate, and an identifiable crawler name.
- Several environments per portal: each environment has its own address and limit.
  - If you don't say which one to scan, the assistant asks.
  - Each run records its environment, and all runs go into the same data store, so nothing extra has to be started for production.
  - The chat's "a developer must change portal settings" error is gone. A public address declared as production now passes.
- "+ new portal" form: has an address field and a limit for each environment. Fill at least one.
- Portal settings: a [settings] button next to the portal dropdown opens a list of the portal's environments.
  - You can add or change one, or revoke one.
  - Runs already recorded are kept, and the last environment can't be revoked.
- Header: I renamed the old "environment" picker to data store, because it only picks which local database the dashboard reads, not what gets scanned.

I checked it in a browser with a throwaway portal (created, added an environment, revoked one), then deleted it. I also confirmed the start-of-scan check accepts production on a public address.

Your existing wikipedia portal is an old-style file with only a sandbox environment, so it still triggers the error you saw. To fix it, choose wikipedia in the portal dropdown, open [settings] and add production with https://www.wikipedia.org/, then revoke sandbox. I left the production limit to you: "fill and submit forms" would make real edits on Wikipedia, and "only look, never submit" maps it safely. After that, say "scan it" in its chat.

The dashboard and chat service are running on the new code. That portal's files are yours and not committed.

R-30 still needs to merge before R-31. Do you want me to push both branches?