export class StandardsCatalog {
  constructor({ bus, graph }) { this.bus = bus; this.graph = graph; }

  async registerStandard({ id, name, description = '' }) {
    await this.bus.emit('standard.registered', { id, name, description });
  }

  async registerVersion({ id, standard_id, standard_name, version, status = 'experimental', requirements = [], previous_id = null, evidence = [] }) {
    await this.bus.emit('standard.version.registered', { id, standard_id, standard_name, version, status, requirements, previous_id, evidence });
  }

  async desire(siteId, standardVersionId, source = 'registry') {
    await this.bus.emit('site.standard.desired', { site_id: siteId, standard_version_id: standardVersionId, source });
  }
}
