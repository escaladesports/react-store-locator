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
import { arraysAreEqual } from '../utils/arrays'
import { strToFixed } from '../utils/string'
import { addressFromPlace } from '../utils/parse-place'
import { enableEnterKey } from '../utils/suggestion-event'
import { mapState } from '../state'

const getLocationsBounds = (locations) => {
	const bounds = new google.maps.LatLngBounds()
	locations.map(location => {
		bounds.extend(
			new google.maps.LatLng(
				parseFloat(location.lat),
				parseFloat(location.lng)
			)
		)
	})
	return bounds
}

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
		this.onMapStateChange = this.onMapStateChange.bind(this)
		this.searchByQuery = this.searchByQuery.bind(this)

		this.state = {
			updatedLocations: props.locations, // locations + show state (toggled on/off)
			bounds: getLocationsBounds(props.locations), // depends on how the inital location is set
			center: { lat: 0, lng: 0 },
			zoom: 6,
			place: null,
			mapLoaded: false,
			props: null,
			newBounds: null, // does not seem to change
			searchInput: ``
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

	// state locations (including show state) within map bounds
	updatedLocationsInBounds({ne, sw})
	{
		const { updatedLocations } = this.state;

		if (ne && sw) {
			return updatedLocations.filter(location => {
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
		}
		else {
			console.error(`invalid bounds : (${JSON.stringify(ne)},${JSON.stringify(sw)})`)
			return updatedLocations;
		}
	}

	// update visible locations on map change
	onMapChanged(props) {
		if (!props || !this.state.mapLoaded) return
		const bounds = {},
			center = {
				lat: props.center.lat > 90 ? props.center.lat - 180 : props.center.lat,
				lng: props.center.lng > 180 ? props.center.lng - 360 : props.center.lng
			}
		bounds.ne = {
			lat:
				props.bounds.ne.lat > 90
					? props.bounds.ne.lat - 180
					: props.bounds.ne.lat,
			lng:
				props.bounds.ne.lng > 180
					? props.bounds.ne.lng - 360
					: props.bounds.ne.lng
		}
		bounds.sw = {
			lat:
				props.bounds.sw.lat > 90
					? props.bounds.sw.lat - 180
					: props.bounds.sw.lat,
			lng:
				props.bounds.sw.lng > 180
					? props.bounds.sw.lng - 360
					: props.bounds.sw.lng
		}

		// locations within the map bounds
		const updatedLocationsInBounds = this.updatedLocationsInBounds(bounds);

		// if enableClusters is enabled create clusters and set them to the state
		if (this.props.enableClusters) {
			const { cluster } = this.props
			const { updatedLocations } = this.state
			this.setState({
				updatedLocations: createClusters(
					props,
					updatedLocationsInBounds.length > 0 ? updatedLocationsInBounds : updatedLocations,
					cluster && cluster.radius,
					cluster && cluster.extent,
					cluster && cluster.nodeSize,
					cluster && cluster.minZoom,
					cluster && cluster.maxZoom
				),
				bounds
			})
		}
		else {
			this.setState({ bounds })
		}

		// find the distance from the center for each location
		const updatedLocationsInBoundsWithDistance = updatedLocationsInBounds.map(location => {
			const distanceMeters = geolib.getDistance(center, {
				lat: location.lat,
				lng: location.lng
			})
			const distanceMiles = (distanceMeters * 0.000621371).toFixed(2)
			location.distanceFromCenter = distanceMiles
			return { ...location }
		})


		if (this.props.onChange && updatedLocationsInBoundsWithDistance) {
			this.props.onChange(updatedLocationsInBoundsWithDistance)
		}
	}

	toggleLocation(id) {
		const updatedLocations = this.state.updatedLocations.map(location => ({
			...location,
			show: location.id === id ? !location.show : false
		}))
		this.setState({ updatedLocations })
	}

	closeLocation(id) {
		const updatedLocations = this.state.updatedLocations.map(location => ({
			...location,
			show: false
		}))
		this.setState({ updatedLocations })
	}

	createMapOptions() {
		const { mapStyle, mapOptions } = this.props
		return {
			styles: mapOptions && mapOptions.styles || mapStyle,
			...this.props.mapOptions
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

	onPlaceChanged(e) {
		if (e) {
			if (e.target.value) {
				this.setState({
					searchInput: e.target.value
				})
			}
		}

		let place = this.searchBox.getPlace()
		if (place && place !== this.state.place) {
			if (this.props.submitSearch) {
				this.props.submitSearch(place)
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
		this.setState({
			newBounds: fitBounds(newBounds, size).newBounds
		})
		return fitBounds(newBounds, size)
	}

	getPlaceViewport(place) {
		const { geometry } = place
		return this.viewPortWithBounds(geometry.viewport)
	}

	getLocationsViewport() {
		let center, zoom
		const { locations, defaultCenter, defaultZoom } = this.props

		if (locations.length === 1) {
			center = {
				lat: parseFloat(locations[0].lat),
				lng: parseFloat(locations[0].lng)
			}
		} else {
			const bounds = getLocationsBounds(locations)
			const viewport = this.viewPortWithBounds(bounds)
			center = viewport.center
			zoom = viewport.zoom
		}

		return {
			center: center || defaultCenter,
			zoom: zoom || defaultZoom
		}
	}

	getCurrentArea() {
		const { locations } = this.props
		const bounds = getLocationsBounds(locations)

		let center
		if (locations.length === 1) {
			center = {
				lat: parseFloat(locations[0].lat),
				lng: parseFloat(locations[0].lng)
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
			zoom: this.googleMapRef.props.zoom,
			size,
			bounds: newBounds
		}
	}

	onMapStateChange(state) {
		const { newBounds, place } = state
		if (place) {
			this.setState({ place })
		}
		if (newBounds) {
			this.setState({ newBounds })
		}
	}

	componentWillUnmount() {
		google.maps.event.clearInstanceListeners(this.searchBox)
		mapState.unsubscribe(this.onMapStateChange)
	}

	componentDidMount() {
		mapState.subscribe(this.onMapStateChange)
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
			center: initialCenter || this.props.defaultCenter,
			// bounds
		})
	}

	componentDidUpdate(prevProps, prevState) {
		const { initSearch: propsInitSearch, place: propsPlace, locations: propsLocations } = this.props
		const { initSearch: prevPropsInitSearch, place: prevPropsPlace, locations: prevPropsLocations } = prevProps
		const { place: statePlace, updatedLocations: stateUpdatedLocations } = this.state
		const { place: prevStatePlace, updatedLocations: prevStateUpdatedLocations } = prevState

		// add or remove any new or deleted location
		if (propsLocations)
		{
			const prevPropsLocationsArray = prevPropsLocations ? prevPropsLocations : [];
			const prevPropsLocationsIds = prevPropsLocationsArray.map(location => location.id);
			const propsLocationsIds = propsLocations.map(location => location.id);
			if (!arraysAreEqual(prevPropsLocationsIds, propsLocationsIds))
			{
				// get added locations (in propsLocations and not in prevPropsLocations)
				const addedLocations = propsLocations.filter(propsLocation => !prevPropsLocationsIds.includes(propsLocation.id));
				// get removed locations (in prevPropsLocations and not in propsLocations)
				const removedLocations = prevPropsLocationsArray.filter(prevPropsLocation => !propsLocationsIds.includes(prevPropsLocation.id));
				// update state immutably (merge & filter) - keep show state of existing locations
				const updatedLocations = [...stateUpdatedLocations, ...addedLocations].filter(location => !removedLocations.map(loc => loc.id).includes(location.id))
				this.setState({ updatedLocations });
			}
		}
	

		if (propsPlace && prevPropsPlace !== propsPlace && propsPlace !== statePlace) {
			this.moveMap(propsPlace)
		}
		if (statePlace && statePlace !== prevStatePlace) {
			this.moveMap(statePlace)
		}
		if (propsInitSearch && prevPropsInitSearch !== propsInitSearch) {
			this.searchByQuery(propsInitSearch)
		}
	}

	searchByQuery(query) {
		const service = new google.maps.places.PlacesService(this.map)
		service.findPlaceFromQuery(
			{
				query: query,
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

	handleGoogleMapApiLoad({ map }) {
		this.map = map

		// D. if initial location set by initSearch => get location from it and center on it
		if (!mapState.state.place) {
			if (this.props.initSearch) {
				this.searchByQuery(this.props.initSearch)
			}
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

		const { bounds, zoom, center } = this.state

		const updatedLocationsInBounds = this.updatedLocationsInBounds(bounds);

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
				{this.props.enableClusters && (
					<Script url="https://unpkg.com/kdbush@3.0.0/kdbush.min.js" />
				)}
				<GoogleMap
					ref={ref => (this.googleMapRef = ref)}
					onGoogleApiLoaded={this.handleGoogleMapApiLoad}
					bootstrapURLKeys={{ key: this.props.googleApiKey }}
					yesIWantToUseGoogleMapApiInternals
					onTilesLoaded={this.props.tilesRendered}
					center={this.props.center || center}
					zoom={this.props.zoom || zoom}
					options={this.createMapOptions}
					onChange={this.onMapChanged}
					gestureHandling={this.props.gestureHandling || `cooperative`}
				>
					{updatedLocationsInBounds.map(location => {
						if (location.cluster_id) {
							return (
								<ClusterPin
									key={location.id}
									lat={location.lat}
									lng={location.lng}
									updateMap={updates => this.onClusterClick(updates)}
									{...location}
									pinProps={
										(this.props.cluster && this.props.cluster.pinProps) || null
									}
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
