# Canvas Fast-Agent Troubleshooting Guide

This document provides solutions for common issues you might encounter when using the Canvas Fast-Agent API.

## MCP Server Connection Issues

### Error: Failed to establish a connection

If you see an error like:
```
Failed to connect to MCP server: HTTPConnectionPool(host='localhost', port=3001): Max retries exceeded with url: /api/tools (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object>: Failed to establish a new connection: [WinError 10061] No connection could be made because the target machine actively refused it'))
```

**Solution:**

1. **Start the MCP Server**
   - From the repository root, build and start the server:
     ```bash
     npm run build
     npm start
     ```
   - Verify it starts without errors

2. **Check Environment Configuration**
   - Ensure `MCP_SERVER_URL` points to the correct location (default is `http://localhost:3001`)
   - Create/update `.env` file in the fast-agent directory with:
     ```
     MCP_SERVER_URL=http://localhost:3001
     ```

3. **Verify Network Settings**
   - Check if port 3001 is available and not blocked by a firewall
   - Try using a different port and update both server configuration and client `.env` file

4. **Claude Desktop Integration**
   - If using with Claude Desktop, verify the `claude_desktop_config.json` has correct settings:
     ```json
     {
       "mcpServers": {
         "canvas": {
           "command": "node",
           "args": [
             "FULL_PATH_TO/canvas-mcp/build/index.js"
           ],
           "env": {
             "CANVAS_API_TOKEN": "your_token_here",
             "CANVAS_DOMAIN": "https://your-canvas-instance.com"
           }
         }
       }
     }
     ```

## Offline Mode

When the MCP server is unavailable, the Fast-Agent API operates in offline mode with the following limitations:

- Uses mock data for courses, assignments, and submissions
- Tool execution relies on pre-defined mock responses
- Limited functionality for Canvas LMS features

You'll see "Running in offline mode - MCP server unavailable" in the API response when this happens.

## Canvas API Token Issues

If the MCP server is running but returns errors:

1. Check that your Canvas API token is valid and hasn't expired
2. Verify the Canvas domain is correct in your configuration
3. Ensure your Canvas account has appropriate permissions for the actions being performed

## Other Common Issues

### AI API Integration

If AI responses are unavailable:

1. Check that DEEPSEEK_API_KEY or GOOGLE_API_KEY is properly configured
2. Verify API endpoint URLs are correct
3. Check for rate limiting or quota issues

### Performance Problems

- Increase timeout values in the code if operations take too long
- Check network latency between components
- Consider running all components locally for better performance

## Getting More Help

For additional assistance:

1. Check the main Canvas-MCP README.md file
2. Create an issue in the project repository
3. Review logs for more detailed error messages:
   ```
   # In the fast-agent directory
   python -m app.main
   ```