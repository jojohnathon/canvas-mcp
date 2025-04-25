# Canvas MCP Web UI

A simple web interface for testing the Canvas MCP tools.

## Features

- Interactive UI for testing all Canvas MCP tools
- Support for student tools and instructor tools
- Ability to view and test all available prompts
- Easy course selection
- Real-time results display
- Copy results to clipboard

## Installation

1. Make sure you have Node.js installed (v14 or higher recommended)
2. Run the installation script:

```bash
node install.js
```

This will:
- Install the required dependencies
- Create a sample `.env` file in the parent directory (if not exists)

3. Edit the `.env` file in the parent directory with your Canvas API token:

```
CANVAS_API_TOKEN=your_canvas_api_token_here
CANVAS_BASE_URL=https://yourinstitution.instructure.com
```

## Running the Web UI

1. Start the web server:

```bash
node server.js
```

2. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. The UI will automatically load all available tools from the Canvas MCP server.
2. Tools are grouped into "Student Tools" and "Other Tools" for easier navigation.
3. Click on "Load Courses" to fetch and display your available courses.
4. Select a tool from the dropdown menu to see its description and required arguments.
5. Fill in the required arguments (marked with *) or select a course from the dropdown.
6. Click "Execute Tool" to run the selected tool with the provided arguments.
7. Results will be displayed in the result section.
8. You can also view available prompts by clicking "Load Prompts".

## Student Tools Available

- `get-my-todo-items` - Fetch the student's to-do list
- `get-upcoming-assignments` - Fetch upcoming assignments across all active courses
- `get-course-grade` - Fetch student's current overall grade in a specific course
- `get-assignment-details` - Fetch details for a specific assignment including submission status
- `get-recent-announcements` - Fetch recent announcements from all active courses
- `list-course-modules` - List modules and items for a course with student completion status
- `find-course-files` - Search files within a course
- `get-unread-discussions` - List unread discussion topics for a course
- `view-discussion-topic` - Retrieve posts/replies for a discussion topic
- `get-my-quiz-submission` - Retrieve student's submission details for a quiz

## Security Considerations

- The Canvas API token is stored in the `.env` file and is used to authenticate with Canvas
- Never share your Canvas API token with others
- This web UI is intended for local development and testing only
- Do not deploy this web UI in a production environment as it may expose your Canvas API token

## Troubleshooting

- If you see "Failed to fetch tools" error, ensure the Canvas MCP server is running
- If tools fail to execute, check that your Canvas API token is valid
- For any other issues, check the console logs for more details 