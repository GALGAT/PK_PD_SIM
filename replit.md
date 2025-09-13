# PKPD Simulator

## Overview

A professional pharmacokinetics and pharmacodynamics (PKPD) simulation tool designed for drug development and analysis. The application provides interactive charting capabilities and parameter controls to model drug concentrations, inhibitor effects, and minimum inhibitory concentration (MIC) dynamics over multiple dosing cycles. Built as a full-stack web application with a React frontend and Express backend, featuring modern UI components and comprehensive mathematical modeling for pharmaceutical research.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **UI Library**: Shadcn/ui components built on Radix UI primitives for accessible, customizable interface elements
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for consistent theming
- **State Management**: React hooks for local state management with complex pharmacokinetic calculations
- **Routing**: Wouter for lightweight client-side routing
- **Data Visualization**: Recharts library for interactive line charts, composed charts, and area charts
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework for HTTP server functionality
- **Language**: TypeScript with ES modules for modern JavaScript features
- **API Structure**: RESTful API design with `/api` prefix routing (currently minimal implementation)
- **Development**: Hot module replacement and development middleware integration with Vite

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Connection**: Neon Database serverless PostgreSQL for cloud deployment
- **Schema Management**: Drizzle Kit for migrations and schema definition
- **In-Memory Storage**: MemStorage class for development and testing scenarios
- **Session Management**: Connect-pg-simple for PostgreSQL-backed session storage

### Authentication and Authorization
- **User Model**: Basic user schema with username/password authentication
- **Validation**: Zod schemas for runtime type validation and data integrity
- **Session Storage**: PostgreSQL-backed sessions for persistent authentication state

### External Dependencies
- **Database Service**: Neon Database for managed PostgreSQL hosting
- **UI Components**: Radix UI ecosystem for accessible component primitives
- **Charting**: Recharts for data visualization and interactive charts
- **Form Handling**: React Hook Form with Hookform resolvers for form validation
- **Date Utilities**: date-fns for date manipulation and formatting
- **Development Tools**: Replit-specific plugins for development environment integration

The application architecture follows a modern full-stack pattern with clear separation between client and server concerns. The mathematical modeling for pharmacokinetics is handled entirely on the frontend for real-time interactivity, while the backend provides API endpoints and data persistence capabilities for future expansion of features like saving simulation results or user-specific configurations.