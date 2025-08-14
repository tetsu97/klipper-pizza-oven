# 🍕 Klipper PIZZA Oven

A self-hosted web application to control and monitor a DIY annealing and drying oven running on Klipper firmware.

## 🔍 What is it?

**Klipper PIZZA Oven** is a custom-tailored web interface—similar in spirit to Mainsail or Fluidd—designed specifically for managing a specialized oven used for **annealing or drying 3D printing filaments**.

Built with 3D printing enthusiasts in mind, this app enables precise profile creation, real-time monitoring, and seamless G-code generation for heating cycles via Klipper.

---

## 🛠️ Features

- 🎛️ Create and edit annealing/drying temperature profiles
- 📊 Interactive graphing of temperature curves using Chart.js
- 🧠 G-code generation based on user-defined segments
- 🔍 Embedded G-code thumbnail preview support
- 🔌 Live Klipper/Moonraker integration via WebSocket
- 🖥️ Modal-based UI optimized for both desktop and mobile (WIP)

---

## 🚀 Installation & Requirements

This app is intended to run **alongside your Klipper + Moonraker setup**.

> ⚠️ It’s currently in active development. Installation is manual. Future plans include packaging as a plug-and-play module.

### Requirements:
- ✅ [Klipper](https://www.klipper3d.org/)
- ✅ [Moonraker](https://github.com/Arksine/moonraker)
- ✅ Python 3.9+ with [FastAPI](https://fastapi.tiangolo.com/)
- ✅ Modern browser

---

## 📈 Tech Stack

- **HTML / CSS / JavaScript**
- **Chart.js** for graph rendering
- **FastAPI** backend (for G-code generation & API)
- **WebSocket** connection to Moonraker
- **Klipper G-code thumbnails** for visual previews

---

## 📦 Roadmap

- 📱 Touch-friendly UI for Raspberry Pi displays (e.g. 5", 7")
- 📦 Packaging as an installable Moonraker extension
- 🌐 Localized UI (multi-language support)

---

## 🤝 Contributing

🚧 Currently closed to public contributions. If you’re interested, stay tuned for when the repo opens!

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.

You are free to use, modify, and distribute this software under the terms of the GPLv3. See the [LICENSE](./LICENSE) file for more information.

---

## 🙏 Acknowledgments

Inspired by Mainsail, Fluidd, and the awesome Klipper/Moonraker ecosystem ❤️
