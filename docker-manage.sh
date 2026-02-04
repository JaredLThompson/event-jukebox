#!/bin/bash

# 🎵 Virtual Jukebox - Docker Management Script
# Manage your local Docker deployment with ease

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

CONTAINER_NAME="event-jukebox"
IMAGE_NAME="event-jukebox:latest"

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo -e "${PURPLE}🎵 Virtual Jukebox - Docker Management${NC}"
    echo -e "${PURPLE}=====================================${NC}"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo -e "  ${CYAN}start${NC}     Start the container"
    echo -e "  ${CYAN}stop${NC}      Stop the container"
    echo -e "  ${CYAN}restart${NC}   Restart the container"
    echo -e "  ${CYAN}logs${NC}      Show container logs"
    echo -e "  ${CYAN}status${NC}    Show container status"
    echo -e "  ${CYAN}shell${NC}     Open shell in container"
    echo -e "  ${CYAN}remove${NC}    Remove container and image"
    echo -e "  ${CYAN}update${NC}    Rebuild and restart container"
    echo -e "  ${CYAN}backup${NC}    Backup playlists and history"
    echo -e "  ${CYAN}restore${NC}   Restore from backup"
    echo -e "  ${CYAN}health${NC}    Check application health"
    echo ""
    echo "Examples:"
    echo "  $0 logs -f     # Follow logs in real-time"
    echo "  $0 backup      # Create backup of data"
    echo "  $0 update      # Update to latest code"
}

check_container_exists() {
    if ! docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_error "Container '${CONTAINER_NAME}' does not exist"
        print_status "Run './deploy-local.sh' to create and start the container"
        exit 1
    fi
}

start_container() {
    check_container_exists
    print_status "Starting container: ${CONTAINER_NAME}"
    if docker start ${CONTAINER_NAME}; then
        print_success "Container started"
        sleep 2
        show_status
    else
        print_error "Failed to start container"
        exit 1
    fi
}

stop_container() {
    check_container_exists
    print_status "Stopping container: ${CONTAINER_NAME}"
    if docker stop ${CONTAINER_NAME}; then
        print_success "Container stopped"
    else
        print_error "Failed to stop container"
        exit 1
    fi
}

restart_container() {
    check_container_exists
    print_status "Restarting container: ${CONTAINER_NAME}"
    if docker restart ${CONTAINER_NAME}; then
        print_success "Container restarted"
        sleep 2
        show_status
    else
        print_error "Failed to restart container"
        exit 1
    fi
}

show_logs() {
    check_container_exists
    print_status "Showing logs for: ${CONTAINER_NAME}"
    docker logs "$@" ${CONTAINER_NAME}
}

show_status() {
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_status "Container Status:"
        docker ps -a --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
        
        # Check if container is running and test health
        if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo ""
            print_status "Testing application health..."
            PORT=$(docker port ${CONTAINER_NAME} 3000 | cut -d: -f2)
            if curl -s http://localhost:${PORT}/api/music-services/status > /dev/null 2>&1; then
                print_success "Application is healthy and responding"
                echo -e "   DJ Interface: ${YELLOW}http://localhost:${PORT}${NC}"
                echo -e "   User Page:    ${YELLOW}http://localhost:${PORT}/user${NC}"
            else
                print_warning "Application may still be starting or has issues"
            fi
        fi
    else
        print_warning "Container '${CONTAINER_NAME}' does not exist"
        print_status "Run './deploy-local.sh' to create and start the container"
    fi
}

open_shell() {
    check_container_exists
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_status "Opening shell in container: ${CONTAINER_NAME}"
        docker exec -it ${CONTAINER_NAME} /bin/bash
    else
        print_error "Container is not running"
        print_status "Start the container first: $0 start"
        exit 1
    fi
}

remove_container() {
    print_warning "This will remove the container and image completely"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            print_status "Stopping and removing container..."
            docker stop ${CONTAINER_NAME} 2>/dev/null || true
            docker rm ${CONTAINER_NAME} 2>/dev/null || true
        fi
        
        print_status "Removing image..."
        docker rmi ${IMAGE_NAME} 2>/dev/null || true
        
        print_success "Container and image removed"
        print_status "Run './deploy-local.sh' to redeploy"
    else
        print_status "Operation cancelled"
    fi
}

update_container() {
    print_status "Updating container with latest code..."
    
    # Stop container if running
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        stop_container
    fi
    
    # Remove container and image
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
    fi
    docker rmi ${IMAGE_NAME} 2>/dev/null || true
    
    # Redeploy
    print_status "Rebuilding and starting container..."
    ./deploy-local.sh
}

backup_data() {
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    print_status "Creating backup in: $BACKUP_DIR"
    
    # Backup local files
    if [[ -f "event-play-history.json" ]]; then
        cp "event-play-history.json" "$BACKUP_DIR/"
        print_success "Backed up play history"
    fi
    
    if [[ -f "wedding-playlist.js" ]]; then
        cp "wedding-playlist.js" "$BACKUP_DIR/"
        print_success "Backed up wedding playlist"
    fi
    
    if [[ -f "bride-playlist.js" ]]; then
        cp "bride-playlist.js" "$BACKUP_DIR/"
        print_success "Backed up bride playlist"
    fi
    
    if [[ -f ".env" ]]; then
        cp ".env" "$BACKUP_DIR/"
        print_success "Backed up environment configuration"
    fi
    
    if [[ -f "oauth.json" ]]; then
        cp "oauth.json" "$BACKUP_DIR/"
        print_success "Backed up YouTube Music authentication"
    fi
    
    # Backup from container if running
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_status "Backing up data from running container..."
        docker cp ${CONTAINER_NAME}:/app/event-play-history.json "$BACKUP_DIR/container-play-history.json" 2>/dev/null || true
    fi
    
    print_success "Backup completed: $BACKUP_DIR"
    ls -la "$BACKUP_DIR"
}

restore_data() {
    if [[ ! -d "backups" ]]; then
        print_error "No backups directory found"
        exit 1
    fi
    
    echo "Available backups:"
    ls -la backups/
    echo ""
    read -p "Enter backup directory name: " BACKUP_NAME
    
    BACKUP_DIR="backups/$BACKUP_NAME"
    if [[ ! -d "$BACKUP_DIR" ]]; then
        print_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
    
    print_status "Restoring from: $BACKUP_DIR"
    
    # Restore files
    for file in "event-play-history.json" "wedding-playlist.js" "bride-playlist.js" ".env" "oauth.json"; do
        if [[ -f "$BACKUP_DIR/$file" ]]; then
            cp "$BACKUP_DIR/$file" .
            print_success "Restored: $file"
        fi
    done
    
    print_success "Restore completed"
    print_status "Restart the container to apply changes: $0 restart"
}

check_health() {
    check_container_exists
    
    if ! docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_error "Container is not running"
        exit 1
    fi
    
    PORT=$(docker port ${CONTAINER_NAME} 3000 | cut -d: -f2)
    print_status "Checking application health on port $PORT..."
    
    # Test basic connectivity
    if curl -s http://localhost:${PORT} > /dev/null; then
        print_success "✅ Web server is responding"
    else
        print_error "❌ Web server is not responding"
        return 1
    fi
    
    # Test API endpoints
    if curl -s http://localhost:${PORT}/api/music-services/status > /dev/null; then
        print_success "✅ API endpoints are working"
        
        # Show service status
        echo ""
        print_status "Music Services Status:"
        curl -s http://localhost:${PORT}/api/music-services/status | jq . 2>/dev/null || curl -s http://localhost:${PORT}/api/music-services/status
    else
        print_error "❌ API endpoints are not responding"
        return 1
    fi
    
    # Test queue endpoint
    if curl -s http://localhost:${PORT}/api/queue > /dev/null; then
        print_success "✅ Queue system is working"
    else
        print_error "❌ Queue system is not responding"
        return 1
    fi
    
    echo ""
    print_success "🎵 Application is healthy and ready for use!"
}

# Main command handling
case "${1:-help}" in
    "start")
        start_container
        ;;
    "stop")
        stop_container
        ;;
    "restart")
        restart_container
        ;;
    "logs")
        shift
        show_logs "$@"
        ;;
    "status")
        show_status
        ;;
    "shell")
        open_shell
        ;;
    "remove")
        remove_container
        ;;
    "update")
        update_container
        ;;
    "backup")
        backup_data
        ;;
    "restore")
        restore_data
        ;;
    "health")
        check_health
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac