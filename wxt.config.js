import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: "JobFill AI",
    description: "Anti-Ghosting Job Application Assistant",
    version: "1.0.0",
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: ["https://*/*", "http://*/*"],
    action: { default_popup: "popup/index.html" }
  },
  modules: ['@wxt-dev/module-react'],
});
