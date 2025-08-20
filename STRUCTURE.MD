# Project Structure: Klipper Pizza Oven Controller

This document describes the file structure and organization of the web interface project for controlling a Klipper-based oven.

## Root Directory

-   `requirements.txt`: A list of Python dependencies for the backend.
-   `pytest.ini`: Configuration file for the Pytest testing framework.

## 📁 app/ - Backend Application (FastAPI)

This folder contains all the backend logic built on the FastAPI framework.

-   `main.py`: The main entry point of the application. It initializes FastAPI, defines the main routes, and includes other routers.
-   `dependencies.py`: Defines dependencies for FastAPI, such as the shared HTTP client for communicating with Moonraker.
-   `logging_config.py`: Configuration for structured logging in JSON format.
-   `models.py`: Defines the Pydantic data models used for validating API requests and responses.
-   `settings.py`: Loads and manages configuration variables (paths, API URLs).
-   `utils.py`: Utility functions used across the backend (e.g., for safe file handling).

### 📁 app/routers/

Contains the individual API endpoints, logically separated into files based on their function.

-   `config.py`: API for managing Klipper configuration files (listing, reading, writing, deleting).
-   `gcodes.py`: API specifically for managing and generating profiles (`pizza_*.cfg`).
-   `klipper.py`: API for direct communication with Klipper/Moonraker (sending G-codes, getting status).
-   `system.py`: API for retrieving information about the host system (disk usage, RAM, CPU temperature).
-   `update.py`: API for managing updates via the Moonraker Update Manager.
-   `websocket.py`: A proxy for the WebSocket connection between the frontend and Moonraker.

---

## 📁 static/ - Frontend Assets

Contains all static files (CSS, JavaScript, third-party libraries) served to the browser.

### 📁 static/css/

-   `styles.css`: Main and global styles for the entire application.
-   `dashboard.css`: Specific styles for the Dashboard page.
-   `display.css`: Specific styles for the touch screen display view.

### 📁 static/js/

-   `app.js`: The main JavaScript file. Contains shared logic, such as establishing the WebSocket connection, Toast notifications, and modal windows.
-   **📁 components/**: Reusable UI parts (settings, sidebar, statusbar).
-   **📁 pages/**: Specific logic for each individual page (dashboard, console, etc.).

### 📁 static/vendor/

-   Third-party libraries used on the frontend, such as **Chart.js** and **CodeMirror**.

---

## 📁 templates/ - HTML Templates (Jinja2)

Contains the HTML templates that FastAPI renders for each page.

-   `base.html`: The base page skeleton that other templates inherit from. Includes the sidebar, header, and footer.
-   `dashboard.html`: Template for the main dashboard page.
-   `console.html`: Template for the console page.
-   `display.html`: Template for the full-screen touch display view.
-   `machine.html`: Template for machine management (files, updates).
-   `profiles.html`: Template for managing and creating temperature profiles.
-   **📁 partials/**: Smaller, reusable HTML snippets, like `status_bar.html` or `settings_modal.html`.

---

## 📁 tests/ - Automated Tests

Contains tests for the backend application to ensure its correct functionality.

-   `conftest.py`: Configuration file for Pytest, defines shared fixtures (e.g., the test client and temporary directories).
-   `test_*.py`: Individual test files for each API router and utility function.