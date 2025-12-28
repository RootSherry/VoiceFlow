import "./globals.css";

export const metadata = {
  title: "VoiceFlow",
  description: "录音转文字 PWA"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}

