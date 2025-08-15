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

## 🚀 Installation and Setup

### Prerequisites

* Python 3.8+ installed.
* A working installation of Klipper and Moonraker on your printer/device.
* Network access to the device.

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/tetsu97/klipper-pizza-oven.git](https://github.com/tetsu97/klipper-pizza-oven.git)
    cd klipper-pizza-oven
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    # For Linux / macOS
    python3 -m venv venv
    source venv/bin/activate

    # For Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **Install the required dependencies:**
    *(I recommend creating a `requirements.txt` file with the following content)*
    ```
    fastapi
    uvicorn[standard]
    jinja2
    python-dotenv
    requests
    ```
    Then install using:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure the Klipper connection:**
    Rename the `.env.example` file to `.env` and modify the values to match the IP address and port of your Moonraker API.

    **`.env` file:**
    ```
    KLIPPER_HOST=192.168.1.100
    KLIPPER_PORT=7125
    GCODE_DIR=/home/pi/printer_data/gcodes
    CONFIG_DIR=/home/pi/printer_data/config
    ```

5.  **Run the application:**
    ```bash
    uvicorn main:app --reload
    ```
    The application will be available by default at `http://127.0.0.1:8000`.

---

## 🤝 Contributing

Have an idea for an improvement or found a bug? Feel free to create an *Issue* or send a *Pull Request*. All contributions are welcome!

---

## 📄 License

This project is licensed under the **MIT License**. For more information, see the [LICENSE](LICENSE) file.
