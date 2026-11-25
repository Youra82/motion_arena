// QR-Code für die README: führt direkt zur installierbaren App auf GitHub Pages.
import QRCode from "qrcode";

export const APP_URL = "https://youra82.github.io/motion_arena/?install=1";

await QRCode.toFile("docs/qr-handy.png", APP_URL, {
  width: 360,
  margin: 2,
  color: { dark: "#101A1D", light: "#F4F2EC" },
});
console.log(`docs/qr-handy.png → ${APP_URL}`);
