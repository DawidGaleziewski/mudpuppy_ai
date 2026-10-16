I want to improve how we handle the map runs on portals

## handling multistep forms with validation and its states
I see a issue in how we handle forms with validation and errors on page.
When wee do murliple runs for map. We first of all do not gather all the states of the step/screen. So we will for example only go through a form but not record  nothing beyond happy path.
The map wont try to i.e enter wrong dfata. use diffrent radio buttons etc. To check and record what is happening on each.
This is as a huge problem as diffrent portals may handle thios diffrently. Some actions (liche radio button) may push us in completly diffrent process. Also validation is a important part of such legacy forms. And we do not record that. We also do not record technical issues. Once recording happy path we shouyld try i.e blocking a http request and recording what happens (error page)

## handling failed map
When I tried to run a map. And trace stoped on form (i.e due to crawler error). I had to restart the map. This is very time consuming. I should be able to restart the map only from certain point and narrow it down to certain path. To drill down the process. And find solutions for this path untill we solve all issues

## handling running map on mor e directed path/starting from diffrent edge
Similar to restarting on error. Sometimes I would like to narrow the crawler to a certain edge. Re-map something or simply continue maping from a specific frontier. This however will start map from beggining. No point really narrowing runs to limited runs if we have to restart it each time. 

## Handling page wit vary steps by BA
BA is quite dump. He has issues when same page has multiple stetes. He will document sometimes only one of the states. Like error page due to some issues on the enviroment. BA should be able to reconcile multiple states of same page and think thru why it is like this. Does it seem like a temp issue? If so this seems like error page worth noticngh but not only one step of the process


# Visual clutter and dashboard
Currently I do not see graph of what we have maped. This is a issue.
I should also be able to use the dashboard to use nodes and mark them what I want to focus on and which parts to try again in new run. We need to update the dashboard
