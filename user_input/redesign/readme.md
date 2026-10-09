# redesign basic
The app seems to work but it does seem to get cumbersome to use.

We probably would be good to redesign it.

## self scan
lets use our tool do document ourself :).
Lets run the mudpuppy on its own dashbaord. Documment it. All its states and plit documentation.

I will use the documentation to add annotations and redesign the app itself. By pushing it to claude designer myself and asking to consider some issues to fix

Scan this first: http://127.0.0.1:8765/ we can come back to duscisssuion leater.

### Issues with ui i see

#### Chat
http://127.0.0.1:8765/chat
Chat is burried in the tab.
It is probably the most important element and should be upfront for user to use on first page. But adding ability to use it on other would be great. I was thinking about adding a iccon to open chatbot on any of the pages. And add ability to switch between using global context to chat with it about current state of the project we selected OR to use context of opened tab. I.E if we go to specific state. We could open it and ask questions. Talk about redesign or something. requirments, gaps etc. Chatbot could update it. But also reverse (something like versioning for states would be nice and especially versioning for ammendments).
WHen opening chat on this page we could add to context current information on it. Making it easy to operate on the current page data, scroll to some vital points, or to find something and navigate to that page in conversation

##### Credentials
This is ok but we should only show this probably only when neeeded. Or at leas toggle it. This does not seems as good place fo this.

##### Process scope functionality
istself is great. But this is not a place for it. IDK where to put it. AI should probably group gathered data into processes. And then we can edit them. Add annotations and create new revision. In form of documentation with as is and what we want to change. So this should be its own process. That is dediceted and focused. THis is crucial fucntionality as rarly we will migrate or change whole portal. We need to split it into processes. That will be migrated (this is how is done in brownfield usually, By cutting a process and changing it i.e into its own microfronted)

##### Process changes and states, revisions
We need to assume (this is not onlu Ui but change to app rpobably so we need new roadmap item for this). That proceses will change, or will be swapped back and forh. I.e current process A. Will be replaced with process B and it can change back and forth (or some of states of the process). By somone else. So keeping revisions of states and processes is also important. Othersie we will override and lose data. I know that I decided to remove annotations after new scan. But this was bad idea in hinghsight. Versioning/revision is a must