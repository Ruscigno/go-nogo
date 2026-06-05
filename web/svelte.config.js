import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// SvelteKit base path matches the Cloudflared ingress prefix
// (`aviationcortex.com/go-nogo/*` → localhost:3018).
// The gear app doesn't know its public URL; it just serves under this
// prefix and the tunnel rewrites.
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    paths: { base: "/go-nogo" },
  },
};

export default config;
