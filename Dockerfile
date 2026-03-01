# Use a recent Ubuntu as the base image
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for Tauri and Node.js
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    build-essential \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libappindicator3-dev \
    librsvg2-dev \
    patchelf \
    libssl-dev \
    pkg-config \
    file \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (v20)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/

# Install frontend dependencies
RUN npm install

# Install server dependencies
RUN cd server && npm install

# Copy the rest of the application code
COPY . .

# Build the application
# This will generate the Linux .deb and AppImage in src-tauri/target/release/bundle/
CMD ["npm", "run", "tauri", "build"]
