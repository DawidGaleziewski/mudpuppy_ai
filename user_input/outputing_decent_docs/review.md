checking docs in:
http://127.0.0.1:8765/docs/reference-insurer/PROC-001/export?portal=reference-insurer


## checked
Folder does download with all files. Looking good

### Download 

#### Images
Multiple images seem to be for all steps <- good
seems it did went to last page of the process with happy path in form <- very good
reported aslso errors and not only errors <- excellent
Both images and wireframes for each step <-awesome
I see nbo validation errors <- bad but not sure if it was also run with probe. If not it is fine. If it was then it is bad


## README.md
Table with steps, outcome, persone, api calls, all excellent and what i need.
Steps at a glance vcery usefull for outlining what it does.
Scans tracing back to what basis it was on <- very good. We need it

## process steps
divided by steps, each with screen and wireframe <- awesome
Form <- excellent on step two. Describes each field, describes validation. Amazing
Requirments regarding form specifically <- Awesome

### issues 
Why there is step7? I dont get it. Why do we record this step tweice? Not sure about this tbh. Seems like a bug. This is quirte worring. WHy be records it twice? I dont understand reasoning behind it. I would even undersatnd it if this was diverging process like due to some option. But I dont see it. Also even if it would change due to i.e ac or other checkbox. I would like to have then BA reconcile that this is same step but with some conditions. And describe conditions exactly. We actually may add this in other mock. This kind of things should be tested. That we do not dup steps. Unless there was reason behind it. Lets actualoly do it. Add some extra box depending on radio. And document it i.e as i.e step 4.a and  4.b. ANd lets add multiple scans showing same step and do evals making sure BA reconciles them correctly. This is quite paramount. generate new mock with tehse concerns.

Validation errors are not dopcumented. I want to see what exactly they say and how ui looks on them.This maybe due to fact we uise native html errors? And we would need to style it or something and put them in a box below to display (this would probably fit native way things work)

## what I would like more
BA makes screens but it used also mark them on must have items. Now it is iis just images. I would like all elements to be marked

## gaps 
looking fine

## openapi
realy good. This is what we are going for.
We may add however add some unrelated calls i.e for resource and some analytics to make sure we are not tracking trash and churn (more for improving the harness)


## dunctional requirments
Looks good. Fact that we have things that are not confirmed. Localisation and language detected also is nice.
Main description flow <- excellent we need this
Alternate flows <- excellent again we need this. I love it
Exception flow <- great

Evidence <- awesome. we can backtrace it and review. Check what went wrong

## contracts
Exactly wehat I wanted

## EARS
ALSO GOOD