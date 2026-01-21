/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          aqua: "#6FAFB2",
          teal: "#1F5E5C",
          yellow: "#F2C94C",
          hibiscus: "#9B3C6E",
        },
        neutral: {
          bg: "#F6F4F1",
          surface: "#FFFFFF",
          border: "#DAD6CF",
          text: "#2B2B2B",
          "text-2": "#5F6361",
          muted: "#8A8F8C",
        },
        semantic: {
          success: "#4FAF91",
          warning: "#F2C94C",
          error: "#C94A4A",
          info: "#6FAFB2",
        },
        btn: {
          primary: "#1F5E5C",
          primaryHover: "#174947",
          primaryDisabled: "#9FB8B6",
          primaryText: "#FFFFFF",

          secondary: "#6FAFB2",
          secondaryHover: "#5E9EA1",
          secondaryDisabled: "#BFD7D8",
          secondaryText: "#2B2B2B",

          ghostHover: "#E6F1F1",

          expressive: "#9B3C6E",
          expressiveHover: "#87345F",
          expressiveText: "#FFFFFF",
        },
        alert: {
          successBg: "#E7F4F0",
          successText: "#1F5E5C",

          warningBg: "#FFF6D8",
          warningText: "#6A5500",

          errorBg: "#FCECEC",
          errorText: "#7A1E1E",

          infoBg: "#EAF4F5",
          infoText: "#1F5E5C",
        },
        status: {
          active: "#1F5E5C",
          inactive: "#8A8F8C",
          completed: "#4FAF91",
          pending: "#6FAFB2",
        },
      },
    },
  },
  plugins: [],
};
