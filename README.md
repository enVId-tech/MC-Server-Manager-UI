# MC Server Creator & Manager

A comprehensive web application for creating, deploying, and managing Minecraft servers with advanced configuration options, real-time monitoring, and automated infrastructure management.

## 🚀 Overview

MC Server Creator is a full-stack Next.js application that provides users with a complete solution for managing Minecraft servers. From initial creation with custom configurations to ongoing management through an intuitive dashboard, this platform streamlines the entire server lifecycle.

## ✨ Features

### 🎮 Server Creation & Management
- **Multi-step Creation Wizard**: Step-by-step interface for creating custom Minecraft servers
- **Multiple Server Types**: Vanilla, Spigot, Paper, Bukkit, Purpur, Forge, and Fabric support
- **Version Support**: Minecraft 1.8 through 1.21+ with version-specific configurations
- **Advanced Configuration**: 50+ server properties including world settings, performance tuning, and player management
- **File Upload**: Plugin, mod, and world file import capabilities

### 🖥️ Dashboard & Monitoring
- **Real-time Server Status**: Live monitoring of server online/offline status
- **Server Management**: Start, stop, and delete servers with progress tracking
- **Advanced Security**: Multi-step deletion confirmation with subdomain verification
- **Auto-refresh**: Automatic dashboard updates every 60 seconds

### 📁 File Management & Editor
- **WebDAV Integration**: Browse and manage server files through the web interface
- **Built-in File Editor**: Edit configuration files directly in the browser
- **Real-time Preview**: View file contents with syntax highlighting
- **Auto-save Protection**: Unsaved changes warning when navigating away
- **File Navigation**: Breadcrumb navigation and folder browsing

### 💬 User Interface & Notifications
- **Styled Notification System**: Beautiful notifications replacing browser alerts
- **Confirmation Dialogs**: Themed modal confirmations for destructive actions
- **Real-time Feedback**: Success, error, warning, and info notifications
- **Auto-dismiss**: Smart notification timing with manual close options
- **Mobile-responsive**: Touch-friendly interface on all devices

### 🔐 Authentication & Security
- **JWT Authentication**: Secure session management with HTTP-only cookies
- **User Registration**: Account creation with validation
- **Protected Routes**: Automatic authentication checks and redirects

### 🌐 Infrastructure Integration
- **Docker Containers**: Automated server deployment via Portainer
- **DNS Management**: Automatic SRV record creation via Porkbun API
- **Dynamic Port Allocation**: Automatic port assignment with conflict resolution
- **File System**: WebDAV integration for server file management

### 🎨 User Experience
- **Responsive Design**: Mobile-first approach that works on all devices
- **Professional UI**: Styled notifications and confirmation dialogs
- **Real-time Feedback**: Live progress tracking and status updates
- **Error Handling**: Comprehensive error messages and recovery options
- **Progressive UI**: Loading states, progress indicators, and smooth animations
- **Accessibility**: Keyboard navigation and screen reader support

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, SCSS Modules
- **Backend**: Next.js API Routes, MongoDB, JWT Authentication
- **Infrastructure**: Docker, Portainer, WebDAV, Porkbun DNS
- **UI/UX**: React Context API, Custom Notification System, Mobile-responsive Design
- **Development**: ESLint, TypeScript, SASS, Node.js 18+

## 🚦 Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd MinecraftServerCreator
   npm install
   ```

2. **Environment Setup**
   Create `.env.local` with your MongoDB, Portainer, and DNS credentials

3. **Start Development**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`

For detailed setup instructions, see the installation guide in the project documentation.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use SCSS modules for styling
- Implement proper error handling with styled notifications
- Write comprehensive commit messages
- Test all authentication flows
- Ensure mobile responsiveness
- Use the global notification system for user feedback

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## ⚠️ Legal Disclaimer

This website and repository/codebase is not an official Minecraft website and is not associated with Mojang Studios or Microsoft. All product and company names are trademarks or registered trademarks of their respective holders. Use of these names does not imply any affiliation or endorsement by them.

## 🙏 Acknowledgments

- **itzg/minecraft-server** - Docker image for Minecraft server deployment
- **Portainer** - Container management platform
- **Porkbun** - DNS management services
- **MongoDB** - Database platform
- **Next.js Team** - Framework development
- **React Community** - Component libraries and tools