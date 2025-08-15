# 🍕 Klipper PIZZA Oven 🍕

![GitHub stars](https://img.shields.io/github/stars/tetsu97/klipper-pizza-oven?style=social)
![GitHub forks](https://img.shields.io/github/forks/tetsu97/klipper-pizza-oven?style=social)
![License](https://img.shields.io/github/license/tetsu97/klipper-pizza-oven)

A modern, responsive, and user-friendly web interface for controlling a 3D printer with Klipper firmware, specially adapted for drying and annealing filaments or for use as a "pizza oven".

The application is built on a **FastAPI** backend and communicates with Klipper via the **Moonraker API**.

---

| Desktop | Mobile |
| :---: | :---: |
| ![Dashboard View](/docs/images/preview1.png) | ![Profiles View](./docs/images/preview2.png) |

---

## ✨ Key Features

* **🖥️ Clean Dashboard:** Monitor temperature, program progress, and G-code preview in real-time, and control your printer.
* **📂 Profile Management:** Create, edit, and manage profiles for filament drying and annealing.
* **📊 G-code Generator:** Easily generate G-code based on temperature segments or a fixed temperature and time.
* **📈 Interactive Charts:** Get a visual preview of the temperature curve during profile creation and program execution.
* **⌨️ Terminal & Console:** Send G-code commands directly to Klipper and view the responses in real-time.
* **📱 Fully Responsive Design:** Control your oven comfortably from your computer, tablet, or mobile phone.
* **📝 File Editor:** Edit Klipper configuration files (`printer.cfg`, etc.) directly from the web interface.

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

This project is licensed under the **MIT License**. For more information, see the [LICENSE](LICENSE) file.
