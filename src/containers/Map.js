import React, { Component } from 'react'
import GoogleMap from 'google-map-react'
import { fitBounds } from 'google-map-react/utils'
import geolib from 'geolib'
import Script from 'react-load-script'

import Pin from './Pin'
import ClusterPin from './ClusterPin'
import Info from './Info'
import infoStyle from './InfoStyle'
import searchStyle from './SearchStyle'
import { createClusters } from '../utils/clustering'
import { objectsAreEqual } from '../utils/objects'
import { strToFixed } from '../utils/string'
import { addressFromPlace } from '../utils/parse-place'
import { enableEnterKey } from '../utils/suggestion-event'

export default class Map extends Component {
	constructor(props) {
		super(props)

		this.createMapOptions = this.createMapOptions.bind(this)
		this.onMapChanged = this.onMapChanged.bind(this)
		this.toggleLocation = this.toggleLocation.bind(this)
		this.closeLocation = this.closeLocation.bind(this)
		this.onPlaceChanged = this.onPlaceChanged.bind(this)
		this.handleGoogleMapApiLoad = this.handleGoogleMapApiLoad.bind(this)
		this.onClusterClick = this.onClusterClick.bind(this)

		this.state = {
			updatedLocations: this.props.locations,
			center: { lat: 0, lng: 0 },
			zoom: 6,
			place: null,
			mapLoaded: false,
			props: null,
			prevBounds: null
		}
	}

	onClusterClick({ zoom, center }) {
		if (zoom && center) {
			this.setState({ zoom, center })
		} else if (!zoom || !center) {
			console.warn(
				`Must include zoom: ${zoom} and center: ${JSON.stringify(
					center
				)} to update map properly. Try using the updateMap function passed through this.props. 
				Example:
				onClick={() => {
					updateMap({
						zoom: this.props.getZoom(this.props.cluster_id)
						center: { lat: this.props.lat, lng: this.props.lng }
					})
				}}
				`
			)
		}
	}

	// update visible locations on map change
	onMapChanged(props) {
		if (!props) return
		const { prevBounds } = this.state
		let sameBounds = true

		if (prevBounds) {
			Object.keys(prevBounds).forEach(k => {
				if (!objectsAreEqual(prevBounds[k], props.bounds[k])) {
					sameBounds = false
				}
			})
		} else {
			this.setState({ prevBounds: props.bounds })
			sameBounds = false
		}

		if (!this.state.mapLoaded) return
		if (sameBounds) return

		const {
			bounds: { ne, sw }
		} = props
		const { locations } = this.props
		// locations within the map bounds

		const foundLocations = locations.filter(location => {
			const lat = strToFixed(location.lat, 6)
			const lng = strToFixed(location.lng, 6)
			if (
				lat >= strToFixed(sw.lat, 6) &&
				lat <= strToFixed(ne.lat, 6) &&
				lng >= strToFixed(sw.lng, 6) &&
				lng <= strToFixed(ne.lng, 6)
			) {
				return location
			}
		})
		// if enableClusters is enabled create clusters and set them to the state
		if (this.props.enableClusters) {
			const { radius, extent, nodeSize, minZoom, maxZoom } = this.props.cluster
			this.setState({
				updatedLocations: createClusters(
					props,
					foundLocations.length > 0 ? foundLocations : locations,
					radius,
					extent,
					nodeSize,
					minZoom,
					maxZoom
				)
			})
		}

		// find the distance from the center for each location
		foundLocations.map(location => {
			const distanceMeters = geolib.getDistance(props.center, {
				lat: location.lat,
				lng: location.lng
			})
			const distanceMiles = (distanceMeters * 0.000621371).toFixed(2)
			location.distanceFromCenter = distanceMiles
			return { ...location }
		})

		if (!this.props.enableClusters) {
			this.setState({ updatedLocations: foundLocations })
		}

		if (this.props.onChange) {
			if (foundLocations) {
				this.props.onChange(foundLocations)
			}
		}
	}

	toggleLocation(id) {
		const locations = this.state.updatedLocations.map(location => ({
			...location,
			show: location.id === id ? !location.show : false
		}))
		this.setState({ updatedLocations: locations })
	}

	closeLocation(id) {
		const locations = this.state.updatedLocations.map(location => ({
			...location,
			show: false
		}))
		this.setState({ updatedLocations: locations })
	}

	createMapOptions() {
		return {
			styles: this.props.mapStyle
		}
	}

	moveMap(place) {
		this.setState({ place })
		const { center, zoom } = this.getPlaceViewport(place)
		this.setState({
			center: center,
			zoom: zoom.toString().length > 1 ? 9 : zoom
		})
	}

	onPlaceChanged() {
		let place = this.searchBox.getPlace()
		if (place && place !== this.state.place) {
			if (this.props.submitSearch) {
				this.props.submitSearch()
			}
			this.moveMap(place)

			const updatedAddress = addressFromPlace(place)
			if (this.props.getValue) {
				this.props.getValue(updatedAddress)
			}
		}
	}

	viewPortWithBounds(bounds) {
		const newBounds = {
			ne: {
				lat: bounds.getNorthEast().lat(),
				lng: bounds.getNorthEast().lng()
			},
			sw: {
				lat: bounds.getSouthWest().lat(),
				lng: bounds.getSouthWest().lng()
			}
		}
		let size = {}
		if (this.mapEl) {
			size = {
				width: this.mapEl.offsetWidth,
				height: this.mapEl.offsetHeight
			}
		}
		return fitBounds(newBounds, size)
	}

	getPlaceViewport(place) {
		const { geometry } = place
		return this.viewPortWithBounds(geometry.viewport)
	}

	getLocationsViewport() {
		let center, zoom

		if (this.props.locations.length === 1) {
			center = {
				lat: parseFloat(this.props.locations[0].lat),
				lng: parseFloat(this.props.locations[0].lng)
			}
		} else {
			const bounds = new google.maps.LatLngBounds()
			this.props.locations.map(location => {
				bounds.extend(
					new google.maps.LatLng(
						parseFloat(location.lat),
						parseFloat(location.lng)
					)
				)
			})
			const viewport = this.viewPortWithBounds(bounds)
			center = viewport.center
			zoom = viewport.zoom
		}

		return {
			center: center || this.props.defaultCenter,
			zoom: zoom || this.props.defaultZoom
		}
	}

	getCurrentArea() {
		const bounds = new google.maps.LatLngBounds()
		this.props.locations.map(location => {
			bounds.extend(
				new google.maps.LatLng(
					parseFloat(location.lat),
					parseFloat(location.lng)
				)
			)
		})

		let center
		if (this.props.locations.length === 1) {
			center = {
				lat: parseFloat(this.props.locations[0].lat),
				lng: parseFloat(this.props.locations[0].lng)
			}
		} else {
			center = {
				lat: bounds.getCenter().lat(),
				lng: bounds.getCenter().lng()
			}
		}

		let size = {
			width: this.mapEl.offsetWidth,
			height: this.mapEl.offsetHeight
		}

		const newBounds = {
			ne: {
				lat: bounds.getNorthEast().lat(),
				lng: bounds.getNorthEast().lng()
			},
			nw: {
				lat: bounds.getNorthEast().lat(),
				lng: bounds.getSouthWest().lng()
			},
			se: {
				lat: bounds.getSouthWest().lat(),
				lng: bounds.getNorthEast().lng()
			},
			sw: {
				lat: bounds.getSouthWest().lat(),
				lng: bounds.getSouthWest().lng()
			}
		}

		return {
			center: center,
			zoom: this.map.props.zoom,
			size,
			bounds: newBounds
		}
	}

	componentDidMount() {
		const { google, options } = this.props
		const input = this.searchInput
		if (this.props.initSearch) {
			input.value = this.props.initSearch
		}
		if (input) {
			this.searchBox = new google.maps.places.Autocomplete(input, options)
			this.searchBox.addListener('place_changed', this.onPlaceChanged)
			enableEnterKey(input, this.searchBox)
		}

		// set default map location
		let initialCenter, initialZoom
		// if initial location set by initSearch (D), location will be changed in handleGoogleMapApiLoad
		if (!this.props.initSearch) {
			// A. if initial location set by initialCenter and initialZoom
			if (this.props.initialCenter) {
				initialCenter = this.props.initialCenter
			}
			if (this.props.initialZoom) {
				initialZoom = this.props.initialZoom
			}
			// B. if initial location set by place => center map on it
			if (this.props.place) {
				const { center, zoom } = this.getPlaceViewport(this.props.place)
				initialCenter = center
				initialZoom = zoom
			}
			// C. if initial location not set => center map on location(s) if any
			else if (this.props.locations && this.props.locations.length > 0) {
				const { center, zoom } = this.getLocationsViewport()
				initialCenter = center
				initialZoom = zoom
			}
		}
		this.setState({
			zoom: initialZoom || this.props.defaultZoom,
			center: initialCenter || this.props.defaultCenter
		})
	}

	componentDidUpdate(prevProps, prevState) {
		const place = this.props.place

		if (place && prevProps.place !== place && place !== this.state.place) {
			this.moveMap(place)
		}
	}

	handleGoogleMapApiLoad({ map }) {
		this.map = map

		// D. if initial location set by initSearch => get location from it and center on it
		if (this.props.initSearch) {
			const service = new google.maps.places.PlacesService(map)
			service.findPlaceFromQuery(
				{
					query: this.props.initSearch,
					fields: [
						'photos',
						'formatted_address',
						'name',
						'rating',
						'opening_hours',
						'geometry'
					]
				},
				(results, status) => {
					const result = results ? results[0] : null

					// no or invalid result from google PlacesService => center map on defaultCenter or locations
					if (!result || results.length < 1) {
						console.warn('No locations with given query')
						let locationsViewport

						// center map on locations if any
						if (this.props.locations && this.props.locations.length > 0) {
							locationsViewport = this.getLocationsViewport()
						}
						this.setState({
							center: locationsViewport.center || this.props.defaultCenter,
							zoom: locationsViewport.zoom || this.props.defaultZoom,
							mapLoaded: true
						})
					}
					// correct result from google PlacesService => set map location to it
					else if (status == google.maps.places.PlacesServiceStatus.OK) {
						const { center, zoom } = this.getPlaceViewport(result)
						this.setState({
							center: center,
							zoom: zoom.toString().length > 1 ? 9 : zoom, // limit zoom to 9
							mapLoaded: true
						})
					}
				}
			)
		}

		if (this.props.mapLoaded) {
			this.props.mapLoaded()
		}

		this.setState({ mapLoaded: true })

		// if initial location was set before map was loaded in componentDidMount (case A, B or C), callback onMapChanged with correct view data to update visible locations
		// this is not needed for case D because onMapChanged is automatically called when map is loaded
		if (!this.props.initSearch) {
			if (this.props.locations && this.props.locations.length > 0) {
				const { center, zoom, size, bounds } = this.getCurrentArea()
				this.onMapChanged({ center, zoom, size, bounds })
			}
		}
	}

	render() {
		let Pin = this.props.pin.component || this.props.pin
		let ClusterPin = this.props.cluster
			? this.props.cluster.component
			: this.props.clusterPin
			? this.props.clusterPin.component
			: this.props.defaultClusterPin

		const { updatedLocations, zoom, center } = this.state
		return (
			<div
				style={{
					height: this.props.height,
					width: this.props.width,
					position: 'relative'
				}}
				ref={mapEl => (this.mapEl = mapEl)}
			>
				<div
					style={{
						position: 'absolute',
						top: 5,
						left: 5,
						zIndex: 2
					}}
				>
					<input
						className="storeLocatorInput"
						style={searchStyle.searchInput}
						onChange={this.onPlaceChanged}
						ref={input => (this.searchInput = input)}
						type="text"
						placeholder="Enter Your Location..."
						aria-label="search"
					/>
				</div>
				{this.props.enableClusters && <Script url="https://unpkg.com/kdbush@3.0.0/kdbush.min.js" />}
				<GoogleMap
					ref={ref => (this.map = ref)}
					onGoogleApiLoaded={this.handleGoogleMapApiLoad}
					bootstrapURLKeys={{ key: this.props.googleApiKey }}
					yesIWantToUseGoogleMapApiInternals
					onTilesLoaded={this.props.tilesRendered}
					center={this.props.center || center}
					zoom={this.props.zoom || zoom}
					options={this.createMapOptions}
					onChange={this.onMapChanged}
				>
					{updatedLocations.map(location => {
						if (location.cluster_id) {
							return (
								<ClusterPin
									key={location.id}
									lat={location.lat}
									lng={location.lng}
									updateMap={updates => this.onClusterClick(updates)}
									{...location}
									pinProps={this.props.cluster.pinProps || null}
								/>
							)
						}
						return (
							<Pin
								key={location.id}
								handleLocationClick={this.toggleLocation}
								lat={location.lat}
								lng={location.lng}
								{...location}
								{...this.props}
								pinProps={this.props.pin.pinProps || null}
							>
								{!this.props.children ? (
									<Info show={location.show} style={this.props.infoStyle}>
										<div style={infoStyle.main}>
											{Object.keys(location).map((k, i) => {
												if (
													k === 'id' ||
													k === 'lat' ||
													k === 'lng' ||
													k === 'show'
												)
													return
												return (
													<div
														key={k}
														style={
															k === 'name'
																? { marginBottom: '12px' }
																: { marginBottom: '2px' }
														}
													>
														{`${location[k]}`}
													</div>
												)
											})}
											<div
												style={infoStyle.close}
												onClick={() => this.closeLocation(location.id)}
											>
												×
											</div>
										</div>
									</Info>
								) : (
									this.props.children(location, this.closeLocation)
								)}
							</Pin>
						)
					})}
				</GoogleMap>
			</div>
		)
	}
}

Map.defaultProps = {
	pin: Pin,
	defaultClusterPin: ClusterPin,
	mapStyle: {},
	height: '800px',
	width: '100%',
	defaultCenter: { lat: 0, lng: 180 },
	defaultZoom: 8
}
