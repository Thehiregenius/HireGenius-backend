# Multi-User Backend

This project is a Node.js and Express backend for a multi-user system that includes user authentication via email/password and Google login. It uses MongoDB for data storage and Mongoose for object modeling.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```
   cd multi-user-backend
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Create a `.env` file in the root directory and add your environment variables (see [Environment Variables](#environment-variables) for details).

## Usage

To start the server, run:
```
npm start
```
The server will run on the port specified in the `.env` file or default to port 5000.

## API Endpoints

### Authentication

- **POST** `/api/auth/register`: Register a new user with email and password.
- **POST** `/api/auth/login`: Log in an existing user with email and password.
- **GET** `/api/auth/google`: Initiate Google OAuth login.
- **GET** `/api/auth/google/callback`: Handle the callback from Google OAuth and issue a JWT.

## Environment Variables

- `MONGO_URI`: MongoDB connection string.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `JWT_SECRET`: Secret key for signing JSON Web Tokens.
- `PORT`: Port number for the server (optional).

## License

This project is licensed under the MIT License.