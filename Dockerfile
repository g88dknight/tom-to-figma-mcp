# Use the Bun image as the base image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /app

# Copy dependency definitions first for better caching
COPY package.json bun.lock ./

RUN bun install

# Copy application source
COPY . .

# Build the TypeScript sources
RUN bun run build

# Expose the HTTP port (overridable via PORT env)
EXPOSE 3000

# Run the compiled server in HTTP mode
CMD ["bun", "run", "dist/server.js", "--mode=http"]
