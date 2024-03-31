const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.configUpdated(config)
		this.state = {}
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)

		var bible_versions = JSON.parse( await this.do_command('GetBibleVersions') )
		this.CHOICES_BIBLE_VERSIONS = bible_versions.data.map( (v) => { return { id: v['key'], label: v['title'] } })

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.initPolling()
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '127.0.0.1',
				regex: Regex.IP,
			},
			{
				type: 'number',
				id: 'port',
				label: 'IP Port',
				width: 6,
				min: 1,
				max: 65535,
				default: 8091,
			},	
			{
				type: 'textinput',
				id: 'token',
				label: 'Access Token',
				width: 4,
			},
		]
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}

	initPolling() {

		function extractCountdownTimeFromPresentation(p) {
			if (p == null 
				|| (p.type != 'unknown' && p.type != 'countdown') 
				|| (p.slide_number != 1 || p.total_slides != 1)
				|| p.slides == null ) {
			  return null
			}
			
			var rows = p.slides[0].text.split("\n")
			if (rows.length != 2 && rows.length != 3) {
			  return null
			}
			var row = (rows.length == 2) ? rows[0] : rows[1]
			var regex = /^[\d:.]*$/
			return regex.test(row) ? row : null
		}



		if (this.pollTimer) {
			clearInterval(this.pollTimer)
		}
		this.pollTimer = setInterval(async () => {
			var slide = JSON.parse(await this.do_command('GetCurrentPresentation', { include_slides: true }))
			var alert = JSON.parse(await this.do_command('GetAlert'))
			var f8    = JSON.parse(await this.do_command('GetF8'))
			var f9    = JSON.parse(await this.do_command('GetF9'))
			var f10   = JSON.parse(await this.do_command('GetF10'))
			this.state['show_alert'] = alert.data?.show
			this.state['slide_id'] = slide.data?.id
			this.state['slide_type'] = slide.data?.type
			this.state['slide_name'] = slide.data?.name
			this.state['song_id'] = slide.data?.song_id
			this.state['reference_id'] = slide.data?.reference_id
			this.state['slide_number'] = slide.data?.slide_number
			this.state['slide_count'] = slide.data?.total_slides
			this.state['f8_active'] = f8?.data
			this.state['f9_active'] = f9?.data
			this.state['f10_active'] = f10?.data

			if (slide.data !== undefined) {
				var t = extractCountdownTimeFromPresentation(slide.data)
				if (t==null) {
					this.state['countdown'] = ''
				} else {
					this.state['countdown'] = t
				}
			} else {
				this.state['countdown'] = ''
			}
			
			this.setVariableValues(this.state)
			this.checkFeedbacks()
		},1000)
 
	}

	async do_command(cmd, options={}) {
		console.log('Command: ', cmd, JSON.stringify(options))
		let url = `http://${this.config.host}:${this.config.port}/api/${cmd}?token=${this.config.token}`
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(options),
		})
		return response.text()
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
