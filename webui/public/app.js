const logger = window.logger || console;

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const toolSelect = document.getElementById('toolSelect');
  const refreshToolsBtn = document.getElementById('refreshToolsBtn');
  const toolDescription = document.getElementById('toolDescription');
  const toolArgs = document.getElementById('toolArgs');
  const loadCoursesBtn = document.getElementById('loadCoursesBtn');
  const courseSelect = document.getElementById('courseSelect');
  const executeToolBtn = document.getElementById('executeToolBtn');
  const toolResult = document.getElementById('toolResult');
  const resultContent = document.getElementById('resultContent');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const loadPromptsBtn = document.getElementById('loadPromptsBtn');
  const promptsList = document.getElementById('promptsList');

  // State
  let availableTools = [];
  let currentToolSchema = null;
  let courses = [];

  // Event Listeners
  refreshToolsBtn.addEventListener('click', fetchTools);
  toolSelect.addEventListener('change', handleToolSelection);
  loadCoursesBtn.addEventListener('click', fetchCourses);
  courseSelect.addEventListener('change', updateExecuteButton);
  executeToolBtn.addEventListener('click', executeTool);
  copyResultBtn.addEventListener('click', copyResultToClipboard);
  loadPromptsBtn.addEventListener('click', fetchPrompts);

  // Fetch tools on page load
  fetchTools();

  // Functions
  async function fetchTools() {
    try {
      const response = await fetch('/api/tools');
      const data = await response.json();
      
      availableTools = data.tools;
      populateToolSelect(availableTools);
    } catch (error) {
      logger.error('Error fetching tools:', error);
      alert('Failed to fetch tools. See console for details.');
    }
  }

  function populateToolSelect(tools) {
    // Clear existing options (keep the placeholder)
    while (toolSelect.options.length > 1) {
      toolSelect.remove(1);
    }
    
    // Add student tools first, then other tools
    const studentTools = tools.filter(tool => 
      ['get-my-todo-items', 'get-upcoming-assignments', 'get-course-grade', 
       'get-assignment-details', 'get-recent-announcements', 'list-course-modules',
       'find-course-files', 'get-unread-discussions', 'view-discussion-topic',
       'get-my-quiz-submission'].includes(tool.name)
    );
    
    const otherTools = tools.filter(tool => 
      !studentTools.some(stTool => stTool.name === tool.name)
    );
    
    // Add student tools
    if (studentTools.length > 0) {
      const studentGroup = document.createElement('optgroup');
      studentGroup.label = 'Student Tools';
      
      studentTools.forEach(tool => {
        const option = document.createElement('option');
        option.value = tool.name;
        option.textContent = tool.name;
        studentGroup.appendChild(option);
      });
      
      toolSelect.appendChild(studentGroup);
    }
    
    // Add other tools
    if (otherTools.length > 0) {
      const otherGroup = document.createElement('optgroup');
      otherGroup.label = 'Other Tools';
      
      otherTools.forEach(tool => {
        const option = document.createElement('option');
        option.value = tool.name;
        option.textContent = tool.name;
        otherGroup.appendChild(option);
      });
      
      toolSelect.appendChild(otherGroup);
    }
  }

  function handleToolSelection() {
    const selectedToolName = toolSelect.value;
    
    if (!selectedToolName) {
      // Reset everything
      toolDescription.classList.add('d-none');
      toolArgs.innerHTML = '<div class="alert alert-secondary">Select a tool to see its arguments</div>';
      currentToolSchema = null;
      updateExecuteButton();
      return;
    }
    
    const selectedTool = availableTools.find(tool => tool.name === selectedToolName);
    
    if (selectedTool) {
      // Show tool description
      toolDescription.textContent = selectedTool.description;
      toolDescription.classList.remove('d-none');
      
      // Store the tool schema
      currentToolSchema = selectedTool.inputSchema;
      
      // Render arguments form
      renderArgumentsForm(currentToolSchema);
    }
    
    updateExecuteButton();
  }

  function renderArgumentsForm(schema) {
    if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
      toolArgs.innerHTML = '<div class="alert alert-info">This tool does not require any arguments</div>';
      return;
    }
    
    const formHtml = document.createElement('div');
    
    // Get the required properties
    const requiredProps = schema.required || [];
    
    // Render each property input
    Object.entries(schema.properties).forEach(([propName, propSchema]) => {
      const isRequired = requiredProps.includes(propName);
      const argDiv = document.createElement('div');
      argDiv.className = `tool-argument ${isRequired ? 'required-field' : ''}`;
      
      // Label
      const label = document.createElement('label');
      label.htmlFor = `arg-${propName}`;
      label.className = 'argument-label';
      label.textContent = propName;
      argDiv.appendChild(label);
      
      // Description
      if (propSchema.description) {
        const description = document.createElement('div');
        description.className = 'argument-description';
        description.textContent = propSchema.description;
        argDiv.appendChild(description);
      }
      
      // Input field
      let input;
      
      if (propSchema.type === 'boolean') {
        // Checkbox for boolean
        input = document.createElement('div');
        input.className = 'form-check';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.id = `arg-${propName}`;
        checkbox.name = propName;
        if (propSchema.default === true) {
          checkbox.checked = true;
        }
        
        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'form-check-label';
        checkboxLabel.htmlFor = `arg-${propName}`;
        checkboxLabel.textContent = 'Enabled';
        
        input.appendChild(checkbox);
        input.appendChild(checkboxLabel);
      } else if (propSchema.type === 'number') {
        // Number input
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control';
        input.id = `arg-${propName}`;
        input.name = propName;
        if (propSchema.default !== undefined) {
          input.value = propSchema.default;
        }
      } else {
        // Default to text input
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.id = `arg-${propName}`;
        input.name = propName;
        if (propSchema.default !== undefined) {
          input.value = propSchema.default;
        }
        
        // For courseId, add datalist with available courses
        if (propName === 'courseId' && courses.length > 0) {
          const datalist = document.createElement('datalist');
          datalist.id = 'course-suggestions';
          
          courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = `${course.name} (${course.id})`;
            datalist.appendChild(option);
          });
          
          input.setAttribute('list', 'course-suggestions');
          argDiv.appendChild(datalist);
        }
      }
      
      argDiv.appendChild(input);
      formHtml.appendChild(argDiv);
    });
    
    toolArgs.innerHTML = '';
    toolArgs.appendChild(formHtml);
  }

  async function fetchCourses() {
    try {
      loadCoursesBtn.disabled = true;
      loadCoursesBtn.textContent = 'Loading...';
      
      const response = await fetch('/api/courses');
      const data = await response.json();
      
      if (data.content && data.content[0] && data.content[0].text) {
        // Parse the course text into structured data
        const courseLines = data.content[0].text.split('---');
        
        courses = courseLines
          .map(courseText => {
            const idMatch = courseText.match(/ID: (\d+)/);
            const nameMatch = courseText.match(/Course: (.+?)(?:\n|$)/);
            
            if (idMatch && nameMatch) {
              return {
                id: idMatch[1],
                name: nameMatch[1].trim()
              };
            }
            return null;
          })
          .filter(course => course !== null);
        
        populateCourseSelect(courses);
        courseSelect.classList.remove('d-none');
      }
    } catch (error) {
      logger.error('Error fetching courses:', error);
      alert('Failed to fetch courses. See console for details.');
    } finally {
      loadCoursesBtn.disabled = false;
      loadCoursesBtn.textContent = 'Load Courses';
    }
  }

  function populateCourseSelect(courses) {
    // Clear existing options (keep the placeholder)
    while (courseSelect.options.length > 1) {
      courseSelect.remove(1);
    }
    
    // Add courses
    courses.forEach(course => {
      const option = document.createElement('option');
      option.value = course.id;
      option.textContent = `${course.name} (ID: ${course.id})`;
      courseSelect.appendChild(option);
    });
  }

  function updateExecuteButton() {
    // Enable execute button if a tool is selected
    executeToolBtn.disabled = !toolSelect.value;
  }

  function collectArguments() {
    const args = {};
    
    if (!currentToolSchema || !currentToolSchema.properties) {
      return args;
    }
    
    // Collect all argument values
    Object.keys(currentToolSchema.properties).forEach(propName => {
      const inputElement = document.getElementById(`arg-${propName}`);
      
      if (inputElement) {
        if (inputElement.type === 'checkbox') {
          args[propName] = inputElement.checked;
        } else if (inputElement.type === 'number') {
          const value = inputElement.value.trim();
          args[propName] = value ? Number(value) : undefined;
        } else {
          const value = inputElement.value.trim();
          args[propName] = value || undefined;
        }
      }
    });
    
    // Special case: if courseId is not provided but selected in the course dropdown
    if (currentToolSchema.properties.courseId && !args.courseId && courseSelect.value) {
      args.courseId = courseSelect.value;
    }
    
    return args;
  }

  async function executeTool() {
    const toolName = toolSelect.value;
    
    if (!toolName) {
      alert('Please select a tool first');
      return;
    }
    
    // Collect arguments
    const args = collectArguments();
    
    // Validate required arguments
    const requiredProps = currentToolSchema?.required || [];
    const missingProps = requiredProps.filter(prop => !args[prop]);
    
    if (missingProps.length > 0) {
      alert(`Missing required arguments: ${missingProps.join(', ')}`);
      return;
    }
    
    try {
      executeToolBtn.disabled = true;
      executeToolBtn.textContent = 'Executing...';
      
      const response = await fetch('/api/call-tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          toolName,
          args
        })
      });
      
      const result = await response.json();
      
      // Display result
      toolResult.classList.remove('d-none');
      resultContent.textContent = JSON.stringify(result, null, 2);
      
      // If the result has content, display a more readable format
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n\n');
        
        if (textContent) {
          resultContent.textContent = textContent;
        }
      }
    } catch (error) {
      logger.error('Error executing tool:', error);
      alert('Failed to execute tool. See console for details.');
    } finally {
      executeToolBtn.disabled = false;
      executeToolBtn.textContent = 'Execute Tool';
    }
  }

  function copyResultToClipboard() {
    navigator.clipboard.writeText(resultContent.textContent)
      .then(() => {
        const originalText = copyResultBtn.textContent;
        copyResultBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyResultBtn.textContent = originalText;
        }, 1500);
      })
      .catch(err => {
        logger.error('Failed to copy text: ', err);
      });
  }

  async function fetchPrompts() {
    try {
      loadPromptsBtn.disabled = true;
      loadPromptsBtn.textContent = 'Loading...';
      
      const response = await fetch('/api/prompts');
      const data = await response.json();
      
      if (data.prompts && Array.isArray(data.prompts)) {
        renderPromptsList(data.prompts);
        promptsList.classList.remove('d-none');
      }
    } catch (error) {
      logger.error('Error fetching prompts:', error);
      alert('Failed to fetch prompts. See console for details.');
    } finally {
      loadPromptsBtn.disabled = false;
      loadPromptsBtn.textContent = 'Load Prompts';
    }
  }

  function renderPromptsList(prompts) {
    const listElement = promptsList.querySelector('ul');
    listElement.innerHTML = '';
    
    // Add each prompt
    prompts.forEach(prompt => {
      const li = document.createElement('li');
      li.className = 'list-group-item prompt-item';
      
      const nameElement = document.createElement('h6');
      nameElement.textContent = prompt.name;
      li.appendChild(nameElement);
      
      if (prompt.description) {
        const descElement = document.createElement('div');
        descElement.className = 'prompt-description';
        descElement.textContent = prompt.description;
        li.appendChild(descElement);
      }
      
      if (prompt.arguments && prompt.arguments.length > 0) {
        const argsElement = document.createElement('div');
        argsElement.className = 'small text-muted mt-1';
        argsElement.textContent = `Arguments: ${prompt.arguments.map(arg => arg.name).join(', ')}`;
        li.appendChild(argsElement);
      }
      
      listElement.appendChild(li);
    });
  }
}); 