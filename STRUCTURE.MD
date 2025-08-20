# Project Structure

## Core Directories

### `app/`
This is the heart of the backend application, built with **FastAPI**.

- **`main.py`** – The main entry point of the FastAPI application.  
  Initializes the app, mounts static files, includes routers, and defines the main page routes (like `/dashboard`).

- **`settings.py`** – Manages application configuration, such as paths to Klipper's config/g-code directories and the Moonraker API URL.

- **`dependencies.py`** – Contains FastAPI dependencies, primarily for managing the shared `httpx.AsyncClient` instance used for communicating with Moonraker.

- **`models.py`** – Defines Pydantic models for request and response data validation (e.g., payloads for saving a profile).

- **`utils.py`** – Holds utility functions used across the backend, such as sanitizing filenames and validating paths.

- **`logging_config.py`** – Sets up structured JSON logging for the application.

---

### `app/routers/`
Contains the API endpoint definitions, separated into logical modules.

- **`system.py`** – Endpoints for fetching host system information (OS, CPU temp, memory, disk usage).  
- **`klipper.py`** – Endpoints that directly interact with Klipper for status updates (e.g., temperature, print progress).  
- **`gcodes.py`** – API for managing heating profiles (annealing, drying). Handles creating, listing, deleting, and starting profiles, stored as `.cfg` files in `printer_data/gcodes`.  
- **`config.py`** – Simple file manager API for viewing and editing files within Klipper's config directory (`printer.cfg`, etc.).  
- **`update.py`** – Proxies requests to Moonraker's update manager to check for and apply updates to Klipper and Moonraker.  
- **`installer.py`** – Handles the installation and verification of the `pizza_oven.py` Klipper module.  
- **`websocket.py`** – Provides a WebSocket proxy to the Moonraker WebSocket for real-time communication.  

---

## Klipper Module

### `klipper_module/`
Contains the Python code that runs directly within Klipper's environment.

- **`pizza_oven.py`** – The Klipper "extra" module implementing custom G-code commands (`LOAD_PROGRAM`, `EXECUTE_PROGRAM`, etc.) for controlling oven heating cycles. Reads profile files from `printer_data/gcodes`.

---

## Frontend

### `templates/`
Contains all **Jinja2 HTML templates** used to render the web interface.

- **`base.html`** – The main layout template (sidebar, main content area, shared modals).  
- **`dashboard.html`, `console.html`, …** – Templates for specific pages of the application.  
- **`partials/`** – Reusable HTML snippets, such as the status bar and modal dialogs.  

### `static/`
Holds all static assets served to the client.

- **`css/`** – Application stylesheets.  
  - `styles.css` – Global styles.  
  - Other files – Page-specific styles.  

- **`js/`** – Client-side JavaScript logic.  
  - **`app.js`** – The main JS module. Handles WebSocket connection, global components (Toasts, Modals), and exports shared functions (`sendGcode`).  
  - **`components/`** – Reusable UI components (status bar, settings modal, dynamic tooltips).  
  - **`pages/`** – Page-specific logic (e.g., `dashboard.js` for chart updates and button logic).  
  - **`vendor/`** – Third-party libraries (Chart.js, CodeMirror).  

---

## Testing and Documentation

### `tests/`
Automated tests for the FastAPI backend (using `pytest`). Each test file corresponds to a specific API router.

- **`conftest.py`** – Pytest configuration file defining fixtures (test client, mock environments).

### `docs/`
Project documentation and related assets.

- **`images/`** – Screenshots and previews for the README.  

---

## Root Files

- **`README.md`** – Main project overview and documentation.  
- **`requirements.txt`** – Python dependencies for the project.  
- **`LICENSE`** – GNU General Public License v3.0.  
- **`pytest.ini`** – Configuration file for running pytest.  
