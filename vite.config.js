import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => ({
    plugins: [react(), tailwindcss()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        css: true,
        globals: true,
    },
    resolve: {
        alias: {
            "@": "/src",
        },
    },
    build: {
        target: "esnext",
    },
    define: {
        __BROWSER_DEV__: JSON.stringify(mode === "development"),
    },
    server: {
        port: 5173,
        open: true,
    },
}));
