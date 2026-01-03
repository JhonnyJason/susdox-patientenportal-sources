import Modules from "./allmodules"
import domconnect from "./indexdomconnect"
domconnect.initialize()

############################################################
global.allModules = Modules
import * as cfg from "./configmodule.js"

############################################################
appStartup = ->
    ## which modules shall be kickstarted?
    # Modules.appcoremodule.startUp()
    return

############################################################
run = ->
    try
        promises = (m.initialize(cfg) for n,m of Modules when m.initialize?) 
        await Promise.all(promises)
        await appStartup()
    catch err then console.error(err)

############################################################
run()
