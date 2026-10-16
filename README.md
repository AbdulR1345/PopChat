# PopChat

A full-stack real-time messaging application built with React, Node.js, Express, MongoDB, and Socket.IO.

PopChat provides a modern, responsive platform for private one-to-one communication, featuring instant messaging, real-time presence, media sharing, and personalized conversation management.

## Features

### Real-Time Communication

- Instant one-to-one text messaging
- Image sharing and shared media gallery
- Online and offline presence
- Live typing indicators
- Message delivery and read receipts
- Unread message counts and conversation previews

### Advanced Messaging

- Emoji reactions
- Message replies
- Edit and delete messages
- Conversation pinning, archiving, and muting
- Real-time updates across multiple browser tabs

### Authentication and User Profiles

- Secure signup and login
- JWT authentication using HTTP-only cookies
- Persistent authenticated sessions
- Profile picture and bio customization
- Availability status
- Email privacy controls

### User Experience

- Modern, responsive interface
- Mobile-friendly conversation layout
- Conversation search and organization
- Session-aware protected routes

## Tech Stack

| Layer          | Technologies                     |
| -------------- | -------------------------------- |
| Frontend       | React, Vite, Redux, Tailwind CSS |
| Backend        | Node.js, Express.js              |
| Database       | MongoDB, Mongoose                |
| Real-time      | Socket.IO                        |
| Authentication | JWT, HTTP-only cookies           |
| Media Storage  | Cloudinary                       |
| Deployment     | Render                           |

## Architecture

PopChat uses a React single-page application with an Express REST API and Socket.IO for bidirectional real-time communication.  
MongoDB stores user profiles, messages, and conversation preferences. Cloudinary handles image storage.  
In production, Express serves the compiled React application alongside the API and WebSocket endpoints under a single HTTPS origin.

## Security and Reliability

- HTTP-only cookie authentication
- Authenticated Socket.IO connections
- Protected API endpoints
- Server-side validation
- Restricted image uploads
- Message-send idempotency
- Session-aware connection handling
- Responsive error handling and reconnection behavior

## Getting Started

### Prerequisites

- Node.js 24
- MongoDB Atlas connection
- Cloudinary account

### Installation

Clone the repository:

````bash
git clone https://github.com/AbdulR1345/PopChat.git
cd PopChat

Install dependencies:

```bash
npm install --prefix backend
npm install --prefix frontend
````

Configure the backend environment using `backend/.env.example` as a reference.

Start the backend:

```bash
npm run dev --prefix backend
```

Start the frontend in another terminal:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:5173`.

## Deployment

PopChat is designed for single-origin deployment on Render, where Express serves the frontend, REST API, and Socket.IO endpoints.

## Author

**Abdul Rahaman**

GitHub: [AbdulR1345](https://github.com/AbdulR1345)
