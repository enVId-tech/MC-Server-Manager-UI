# Use an official node image as the base image
FROM node:latest

# 1. Update system certificates inside the container
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates

# Set the working directory in the container
WORKDIR /nextapp

COPY . /nextapp

# 2. Set the environment variable so it applies to build AND runtime
ENV NODE_OPTIONS="--use-system-ca"

RUN npm install

RUN npm run build

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run app when the container launches
CMD ["npm", "start"]