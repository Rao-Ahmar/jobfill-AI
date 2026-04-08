import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: "JobFill AI",
    description: "Anti-Ghosting Job Application Assistant",
    version: "1.0.0",
    permissions: ["storage", "activeTab", "scripting", "tabs", "sidePanel"],
    host_permissions: ["https://*/*", "http://*/*"],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png"
    },
    action: {
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png"
      }
    },
    side_panel: {
      default_path: "sidepanel/index.html"
    }
  },
  modules: ['@wxt-dev/module-react'],
});
