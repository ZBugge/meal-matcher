#!/bin/bash
set -e

echo "Building MealMatch..."

# Install client dependencies and build
echo "Building client..."
cd client
npm install
npm run build
cd ..

# Install server dependencies and build
echo "Building server..."
cd server
npm install
npm run build
cd ..

echo "Build complete!"
