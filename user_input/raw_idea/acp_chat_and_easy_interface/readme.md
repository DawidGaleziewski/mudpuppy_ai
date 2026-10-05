# problem:
I will be honest. As much as I like the results of the current runs. My one problem is even I am lost in the workflow.

I know i ask for the agent to scan a new portal, then it does traces and documents the whole portal at once.
But I am kinda at lost in which part of the process I am. What I can do (there are multiple skills and few agents). And what to invoke. Real BA if using this shell (even if we thought him and would be a ex dev). Would have problems understanding what options he has.


## Propose solultion - phase 1
First we should create a orchestrator or a main agent. Lets thing about it same way we would think about a chatbot.
For example we can call it "chatbot". It won't aollow its user to do any modifications to harness itself. This would be done from the shell.
It would enforce the workflow. For example if not portals were yet scanner. It can tell user that it can scan a portal. But it needs url, login credentials for test user and its persona.
It can work with user on creating a persona (probably best to have create-persona skill). 

If portals were scanned I would like agent to propose if we want to continue the work. Or mat the processes (as ba does now), or create documentation.

## How I see it in daly workflow situation

### Intro scenario 1
1. Ba comes. Asks what he can do and how he can work. chatbot explains possible functions and i.e how to scan a portal.
2. Ba can run the scan. On his chosed url with credentials and persona he created.

### BA wants to documetn specific process
1. BA wants to document existing process. He uses states, sites, pages that we maped to describe where the process starts and where it ends.
2. Chatbot can work with BA to close the gaps like: which persona to use, exactly on which state the process starts. Where it ends
3. BA is given a nice documentation with all requirments <- these should be a artifact that should be suited to read, show stakeholders but especially to be consumend by another agent. That would i.e use this as reference of as-is-state and with extra description on what should be changed/ammended to current state

This is probably why it is a good idea for BA to be able to add ammendments to states that we have and gathered evidence like: (this button should now look like this, here on wireframe button 1).
Or draw something new on wireeframe. Or attach something for it.
This way we see "ass-is state" and can easilly communicate in a clear way changes.

## Dashboard changes

### Interactive window for input
First a window to communicate with chatbot. It should be clearly communicating what is happening. If somehing wring is going on. Error should be displayed. So that dev can add solutions i.e for crawler, permissions etc. And errors should be loged locally in logs folder. Referance id should point to it.
I also added in this folder cool gif for when chatbot is working i.e crawling a portal to be played

Also steps to achieve documentation should be shown in process. Which is pending and whioch is in progress, which failed, which is still to be done. SO BA have clear understanding on what to do next.
Not sure if there are ready solutions to be used with chatboats

### Process narrowing 
In real word we rarly will transfer WHOLE portal. As they are huge. BA needs to focus on specific process. I.E. a form for getting insuracnce for car.
He should be able to pick where it starts and where it ends. I am thinking maybe agent can propose as per description which process is to be documented? And then BA can pick from checkbox like list of states with screens as we have them. Add extra comments etc.

## Tech solution (to be discussed)
I was thinking to use APC as this should give us low grain control and connect it to our existing dashboard
