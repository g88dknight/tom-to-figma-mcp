# Use the Bun image as the base image (debian variant has bash)
FROM oven/bun:1-debian

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

# Copy start script
COPY start.sh ./

# Run the service based on RAILWAY_SERVICE_NAME
# Use bash to execute the script since bun might not handle shell scripts well
CMD ["/bin/bash", "./start.sh"]
