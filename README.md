# Federal Register Analysis Tool

A comprehensive web platform for analyzing and visualizing public comments on Federal Register regulations.

## 🎯 Purpose

This tool provides multiple interfaces for exploring public comment data:
- **Entity Browser**: Browse comments by organizations and key entities
- **Theme Explorer**: Analyze comments by topics and themes  
- **Timeline View**: Chronological analysis of comment submissions
- **Sentiment Dashboard**: Sentiment analysis and trends
- **Admin Panel**: Data management and exports

## 🚀 Quick Start

```bash
# Install dependencies
bun install
bun run setup

# Start development servers
bun run dev
```

## 📊 Data Source

This platform displays data processed by the companion CLI tool that:
1. Scrapes regulations.gov for public comments
2. Uses AI to extract themes, entities, and summaries
3. Stores results in SQLite databases

## 🏗️ Architecture

```
CLI Tool → SQLite Database → API Server → Web Interfaces
```

## 🌐 Interfaces

- **Entity Browser**: http://localhost:8000/entity-browser/
- **Theme Explorer**: http://localhost:8000/theme-explorer/ 
- **Timeline View**: http://localhost:8000/timeline-view/
- **Sentiment Dashboard**: http://localhost:8000/sentiment-dashboard/
- **Admin Panel**: http://localhost:8000/admin-panel/

## 📡 API Endpoints

- `GET /api/stats` - Database statistics
- `GET /api/comments` - List comments (paginated)
- `GET /api/entities` - List entities
- `GET /api/themes` - List themes
- `GET /api/export` - Export data

## 🚢 Deployment

See `/deployment/` folder for platform-specific deployment configurations.

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Interface Guide](docs/INTERFACES.md) 
- [Deployment Guide](docs/DEPLOYMENT.md)
