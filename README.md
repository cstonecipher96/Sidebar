# Life Votes

Put your life decisions to a vote and let your friends decide — live.

1. `npm start` (Node 18+, no dependencies) → open http://localhost:3000
2. Enter your name and a room code, then share the invite link with friends.
3. Anyone in the room can ask a question ("Should I quit my job?") with 2–6 options.
4. Everyone votes; results and who-voted-what update instantly for all (Server-Sent Events).
   Click another option to switch your vote, or your own vote again to remove it.

Data is kept in memory and saved to `data.json`. To let friends join from their own phones,
deploy anywhere that runs Node (Render, Railway, Fly.io, Glitch) or tunnel your local server
(`npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`).
