import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                cream: {
                    DEFAULT: "#fefbea",
                    50: "#fffef7",
                    100: "#fefbea",
                    200: "#fdf5d0",
                    300: "#faeeb5",
                    400: "#f5e48a",
                },
                terracotta: {
                    DEFAULT: "#c76b4f",
                    50: "#fdf3ef",
                    100: "#fbe4db",
                    200: "#f6c5b5",
                    300: "#f0a08a",
                    400: "#d8845e",
                    500: "#c76b4f",
                    600: "#b45a40",
                    700: "#964935",
                    800: "#7a3d2f",
                    900: "#653429",
                },
                clay: {
                    DEFAULT: "#E8CFC2",
                    light: "#f3e6dc",
                    dark: "#d4b5a3",
                },
                dark: {
                    DEFAULT: "#000000",
                    text: "#1F1F1F",
                    secondary: "#4A4A4A",
                    muted: "#7A7A7A",
                },
            },
            fontFamily: {
                playfair: ["var(--font-playfair)", "serif"],
                inter: ["var(--font-inter)", "sans-serif"],
            },
            borderRadius: {
                "2xl": "1rem",
                "3xl": "1.5rem",
            },
            boxShadow: {
                soft: "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
                card: "0 4px 25px -5px rgba(0, 0, 0, 0.08)",
                hover: "0 10px 40px -10px rgba(0, 0, 0, 0.12)",
                glow: "0 0 30px rgba(199, 107, 79, 0.15)",
            },
            animation: {
                "fade-in": "fadeIn 0.6s ease-out forwards",
                "fade-up": "fadeUp 0.7s ease-out forwards",
                "slide-in-left": "slideInLeft 0.6s ease-out forwards",
                "slide-in-right": "slideInRight 0.6s ease-out forwards",
                "scale-in": "scaleIn 0.5s ease-out forwards",
                float: "float 6s ease-in-out infinite",
                shimmer: "shimmer 2s linear infinite",
                "text-reveal": "textReveal 0.8s cubic-bezier(0.77, 0, 0.175, 1) forwards",
                "counter-up": "counterUp 2s ease-out forwards",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                fadeUp: {
                    "0%": { opacity: "0", transform: "translateY(30px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                slideInLeft: {
                    "0%": { opacity: "0", transform: "translateX(-50px)" },
                    "100%": { opacity: "1", transform: "translateX(0)" },
                },
                slideInRight: {
                    "0%": { opacity: "0", transform: "translateX(50px)" },
                    "100%": { opacity: "1", transform: "translateX(0)" },
                },
                scaleIn: {
                    "0%": { opacity: "0", transform: "scale(0.9)" },
                    "100%": { opacity: "1", transform: "scale(1)" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                textReveal: {
                    "0%": { opacity: "0", transform: "translateY(100%)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                counterUp: {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
