At the end of the day. Mudputty needs to export proper documentation that should be used in order to recreate the portal/migrate it.
I want to record the behaviour and be able to take old .net form and make out of it shinny new react + node microservice.

However our output seems to suck and it is confusing even where I get it.

WHat I want

## able to see current documentation

## able to export whole documentation of the portal as a .md

## able to export single process as a .md file

## able to export all recorded processes as .md files

# what I want to see in a export (i.e for a single process)

A folder with:
README.md <- description on what this service does. What process it handles

PROCESS_STEPS.md <- description of each step of the process. Each step needs to have descrribed what it has. What user will see. What are possible states like error, happy path, loading.
Each step should have screenshot with evidence. Business requirments all other things we recorded. All types of requirments to recreate it properly

BUISNESS_REQUIREMENTS.md <- description of all business requirements.
FUNCTIONAL_REQUIREMENTS.md <- description of all functional requirements.

GAPS.md <- description of all gaps. Things we are unsure about.

I want to see wireframes there. Description of each field.

EARS.md <- description of all ears requirments basing on all prevuious ones

CONTRACTS.md <- description of all contracts we recorded. What state sends what data. also with openApi/swagger for all requests. Examples of logic in code. What appis are contacted. What is send to them during diffrent attempts. What comes back. (It will be probably a challange to declutter this as there will be a lot of junk going back and forth. But AI should be able to pull important datat from it. Tell us what api is beeing used. What data is beeing send where)

## how to achieve this.

Put this on roadmap.
Generate examples of such exported artifacts. So I judge what I fell is usefull and what not. Use current data of what was gathered and what would be possbiel to be put there.

(you dont need to use actual data. Just make mocks here as target examples for me to judge).
At end we will create eval for this.