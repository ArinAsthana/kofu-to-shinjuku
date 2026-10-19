# Claude connector

Lets any Claude chat read and change the app's data, e.g. "log 2 onigiri for lunch" or "move the gym to 4 tomorrow".
It's a small MCP server in `worker.js` that runs on Cloudflare Workers (free). It writes to the same Firebase data the app syncs,
and the app shows the changes the next time it's opened while signed in.

Tools: `get_day`, `log_food`, `log_weight`, `tick_habit`, `tick_care`, `add_task`, `complete_task`, `add_deadline`, `list_deadlines`, `move_deadline`, `add_exam_result`, `add_block`, `move_block`, `add_wishlist_item`.
`add_deadline` ("social psych paper due Nov 20") puts the deadline on the calendar and creates prep sessions the app places before it.
`add_exam_result` ("I got 82 on the algebra midterm out of 100") puts a real exam on the Report Card.
`move_block` follows the app's edit lock (no changes from 15 min before a block until it ends). Workouts are still logged in the app.

## Setup (one time, about 15 minutes)

1. **App:** open it on your phone, go to System → settings (sliders icon) → Sync, and sign in with Google if you haven't.
   Open "Claude connector ID" and copy the ID.
2. **Firebase key:** [Firebase console](https://console.firebase.google.com/) → project *kofu-to-shinjuku* → gear icon → Project settings →
   Service accounts → **Generate new private key**. A `.json` file downloads. Treat it like a password.
3. **Cloudflare:** sign up free at [dash.cloudflare.com](https://dash.cloudflare.com/) → Workers & Pages → Create →
   **Import a repository** → `ArinAsthana/kofu-to-shinjuku`, Worker name `kts-connector`. The repo's `wrangler.jsonc` makes it
   deploy `connector/worker.js`, and every push to main redeploys it. (No code to paste. The dashboard editor is hidden for
   Git-connected Workers; that's normal.)
4. **Secrets:** in the worker, Settings → Variables and secrets → add three, each as type **Secret**:
   - `SA_JSON`: the whole contents of the downloaded `.json` file
   - `UID`: the ID from step 1
   - `PATH_TOKEN`: a long random string you make up (30+ letters and numbers)
5. **Check:** open `https://kts-connector.<your-subdomain>.workers.dev/mcp/<PATH_TOKEN>` in a browser. It should list three OK lines.
   Any BAD line says what to fix.
6. **Claude:** claude.ai (or the app) → Settings → Connectors → **Add custom connector**. Name it *Kofu to Shinjuku*. URL:
   `https://kts-connector.<your-subdomain>.workers.dev/mcp/<PATH_TOKEN>`. Leave the auth settings empty.
7. In a chat, turn the connector on from the tools menu and try "what's on my timetable today?".

## Safety

- The URL is the password: anyone with it can change your app data. Don't share it. To revoke, change `PATH_TOKEN`.
- The Firebase key stays in Cloudflare's secret store, never in this public repo.
- Every write is checked against the data's last-saved time, so a sync from your phone at the same moment is never overwritten.
