# MC Server Manager

A web application for managing Minecraft servers with user authentication and dashboard functionality.

## Overview

MC Server Manager provides a web interface to monitor and control Minecraft server instances. The application includes user authentication, server status monitoring, and a dashboard for managing server operations.

## Features

- **User Authentication**: Secure login/logout functionality with JWT tokens
- **User Registration**: Account creation with admin approval system
- **Server Dashboard**: Monitor and manage Minecraft server instances
- **Responsive UI**: Modern interface with mobile-friendly design

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, SCSS Modules
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, bcrypt for password hashing
- **Styling**: SCSS Modules with responsive design

## Getting Started

### Prerequisites

- Node.js
- MongoDB instance (local or cloud)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   MONGODB_URI=your_mongodb_connection_string
   MONGODB_DB=your_database_name
   JWT_SECRET=your_jwt_secret_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

- `/app`: Next.js application routes and components
    - `/_components`: Reusable UI components
    - `/api`: Backend API routes
    - `/auth`: Authentication pages
    - `/manager`: Server management pages
- `/lib`: Utility functions and database models
    - `/objects`: MongoDB models
- `/public`: Static assets

## API Endpoints

- `POST /api/auth/signup`: Register a new user
- `POST /api/auth/login`: Authenticate a user
- `GET /api/auth/check`: Verify authentication status
- `POST /api/auth/logout`: Log out a user

## License

MIT License