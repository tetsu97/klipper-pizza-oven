# 🍕 Klipper PIZZA Oven 🍕

![GitHub stars](https://img.shields.io/github/stars/tetsu97/klipper-pizza-oven?style=social)
![GitHub forks](https://img.shields.io/github/forks/tetsu97/klipper-pizza-oven?style=social)
![License](github.com/tetsu97/klipper-pizza-oven/tree/main#GPL-3.0-1-ov-file)

A modern, responsive, and user-friendly web interface for controlling a DIY Oven with Klipper firmware, specially adapted for annealing 3D printed parts and drying filaments or for use as a "pizza oven".

The application is built on a **FastAPI** backend and communicates with Klipper via the **Moonraker API**.

---

| Desktop | Mobile |
| :---: | :---: |
| ![Dashboard View](/docs/images/preview1.png) | ![Profiles View](./docs/images/preview2.png) |

---

## ✨ Key Features

* **🖥️ Dashboard:** Monitor temperature, program progress, and G-code preview in real-time, and control your oven.
* **📂 Profile Management:** Create, edit, and manage profiles for annealing and filament drying.
* **📊 G-code Generator:** Easily generate G-code based on temperature segments or a fixed temperature and time.
* **📈 Interactive Charts:** Get a visual preview of the temperature curve during profile creation and program execution.
* **⌨️ Terminal & Console:** Send G-code commands directly to Klipper and view the responses in real-time.
* **📱 Fully Responsive Design:** Control your oven comfortably from your computer, tablet, or mobile phone.
* **📝 File Editor:** Edit Klipper configuration files (`printer.cfg`, etc.) directly from the web interface.

---

## 🚀 Roadmap & Future Plans

This project is actively developed. Here are some of the features and improvements planned for the future:

* Language Localization: Add support for multiple languages (e.g., German, Czech).

* Job History: Log and review past cycles, including a chart of the actual temperature curve.

* Simplified Installation: Create an installation script and package the application as a Moonraker extension for easy setup.

* Theme Switching: Implement a light theme and a high-contrast mode.

* And much more...

---

## 🛠️ Tech Stack

* **Backend:** Python 3, FastAPI, Uvicorn, Jinja2
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Visualization:** Chart.js
* **Code Editor:** CodeMirror
* **Klipper Communication:** Moonraker API

---

## 🤝 Contributing

Have an idea for an improvement or found a bug? Feel free to create an *Issue* or send a *Pull Request*. All contributions are welcome!

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**. For more information, see the [LICENSE](LICENSE) file.

---

❤️ Support My Work
If you like this project and find it useful, please consider supporting me. A small donation helps me dedicate more time to maintaining this project and developing new features. Every contribution is highly appreciated!


<div align="center">
<a href="https://ko-fi.com/tetsu97" target="_blank">
<img src="https://storage.ko-fi.com/cdn/opengraph_assets/default_creator_og/hz_profile_page.png" alt="Buy Me a Coffee at ko-fi.com" style="height: 150px !important; width: auto !important;">
</a>
</div>
