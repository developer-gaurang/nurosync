# Bio-Panic Dashboard

A real-time EOG/EEG data monitoring dashboard for the Debugger Squad project, communicating with an ESP32-S3 board via Web Serial API.

## Features

- **Real-time Signal Graph**: HTML5 Canvas visualization of 0-4095 raw sensor values
- **AI Panic Detection**: Dynamic prediction bar showing panic level percentage
- **Web Serial API Integration**: Direct communication with ESP32-S3 via serial port
- **Remote Control D-Pad**: Send commands (F/B/L/R/S) back to the ESP32
- **Dark Theme UI**: Professional Tailwind CSS dark interface
- **Live Statistics**: Peak, average, and sample count tracking

## Prerequisites

- Node.js 16+ and npm
- Modern browser with Web Serial API support (Chrome, Edge, etc.)
- ESP32-S3 board with firmware

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The dashboard will automatically open at `http://localhost:5173`

## Building for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/
│   └── BioDashboard.jsx    # Main dashboard component
├── App.jsx                  # Root component
├── main.jsx                 # React entry point
└── index.css               # Tailwind CSS styles
```

## Serial Communication Protocol

### Data from ESP32 (Input)
CSV format: `rawValue,panicScore`
- `rawValue`: 0-4095 (analog sensor reading)
- `panicScore`: 0-100 (AI prediction percentage)

### Commands to ESP32 (Output)
Single byte commands:
- `F` - Forward
- `B` - Backward
- `L` - Left
- `R` - Right
- `S` - Stop

## Technology Stack

- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **Web Serial API**: Hardware communication
- **Canvas API**: Real-time graph rendering

## Browser Compatibility

- Chrome 89+
- Edge 89+
- Opera 75+
- Requires HTTPS or localhost

## License

Debugger Squad © 2026
