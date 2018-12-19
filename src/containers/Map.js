import React, { Component } from 'react'
import GoogleMap from 'google-map-react'
import { fitBounds } from 'google-map-react/utils'
import geolib from 'geolib'

import Pin from './Pin'
import ClusterPin from './ClusterPin'
import Info from './Info'
import infoStyle from './InfoStyle'
import searchStyle from './SearchStyle'
import { createClusters } from '../utils/clustering'
import { objectsAreEqual } from '../utils/objects'
import { strToFixed } from '../utils/string'

export default class Map extends Component {
	constructor(props) {
		super(props)

		this.createMapOptions = this.createMapOptions.bind(this)
		this.changeMap = this.changeMap.bind(this)
		this.toggleLocation = this.toggleLocation.bind(this)
		this.closeLocation = this.closeLocation.bind(this)
		this.onPlaceChanged = this.onPlaceChanged.bind(this)
		this.handleMapLoad = this.handleMapLoad.bind(this)
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

	changeMap(props) {
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
			this.setState({
				updatedLocations: createClusters(
					props,
					foundLocations.length > 0 ? foundLocations : locations
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
		const { geometry } = place
		const newBounds = {
			ne: {
				lat: geometry.viewport.getNorthEast().lat(),
				lng: geometry.viewport.getNorthEast().lng()
			},
			sw: {
				lat: geometry.viewport.getSouthWest().lat(),
				lng: geometry.viewport.getSouthWest().lng()
			}
		}
		let size = {}
		if (this.mapEl) {
			size = {
				width: this.mapEl.offsetWidth,
				height: this.mapEl.offsetHeight
			}
		}
		const { center, zoom } = fitBounds(newBounds, size)
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
		}
	}

	componentDidMount() {
		const { google, options } = this.props
		if (this.props.initSearch) {
			this.searchInput.value = this.props.initSearch
		}
		if (this.searchInput) {
			this.searchBox = new google.maps.places.Autocomplete(this.searchInput, options)
			this.searchBox.addListener('place_changed', this.onPlaceChanged)
		}
		let defaultZoom = 8,
			defaultCenter = { lat: 0, lng: 180 }
		if (
			!this.props.initSearch &&
			(this.props.locations && this.props.locations.length > 0)
		) {
			if (this.props.locations.length === 1) {
				defaultCenter = {
					lat: parseFloat(this.props.locations[0].lat),
					lng: parseFloat(this.props.locations[0].lng)
				}
			}
			if (this.props.locations.length > 1) {
				const bounds = new google.maps.LatLngBounds()
				this.props.locations.map(location => {
					bounds.extend(new google.maps.LatLng(location.lat, location.lng))
				})
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
				const { center, zoom } = fitBounds(newBounds, size)

				defaultZoom = zoom
				defaultCenter = center
			}
		}

		this.setState({
			zoom: defaultZoom,
			center: defaultCenter
		})
	}

	componentDidUpdate(prevProps, prevState) 
	{
		const place = this.props.place;

		if (place && prevProps.place !== place && place !== this.state.place) { 
			this.moveMap(place); 
		} 
	} 

	handleMapLoad({ map }) {
		this.map = map
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
					if (!result || results.length < 1) {
						console.warn('No locations with given query')
						let defaultZoom = 8,
							defaultCenter = { lat: 0, lng: 180 }
						if (this.props.locations && this.props.locations.length > 0) {
							const bounds = new google.maps.LatLngBounds()
							this.props.locations.map(location => {
								bounds.extend(
									new google.maps.LatLng(location.lat, location.lng)
								)
							})
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
							const { center, zoom } = fitBounds(newBounds, size)
							defaultZoom = zoom
							defaultCenter = center
						}
						this.setState({
							zoom: defaultZoom,
							center: defaultCenter,
							mapLoaded: true
						})
					} else {
						if (status == google.maps.places.PlacesServiceStatus.OK) {
							const { geometry } = result
							const newBounds = {
								ne: {
									lat: geometry.viewport.getNorthEast().lat(),
									lng: geometry.viewport.getNorthEast().lng()
								},
								sw: {
									lat: geometry.viewport.getSouthWest().lat(),
									lng: geometry.viewport.getSouthWest().lng()
								}
							}
							const size = {
								width: this.mapEl.offsetWidth,
								height: this.mapEl.offsetHeight
							}
							const { center, zoom } = fitBounds(newBounds, size)
							this.setState({
								center: center,
								zoom: zoom.toString().length > 1 ? 9 : zoom,
								mapLoaded: true
							})
						}
					}
				}
			)
		}

		if (this.props.mapLoaded) {
			this.props.mapLoaded()
		}

		this.setState({ mapLoaded: true })

		if (!this.props.initSearch) {
			if (this.props.locations.length > 0) {
				const bounds = new google.maps.LatLngBounds()
				this.props.locations.map(location => {
					bounds.extend(
						new google.maps.LatLng(
							parseFloat(location.lat),
							parseFloat(location.lng)
						)
					)
				})
				let center = {
					lat: bounds.getCenter().lat(),
					lng: bounds.getCenter().lng()
				}
				if (this.props.locations.length === 1) {
					center = {
						lat: parseFloat(this.props.locations[0].lat),
						lng: parseFloat(this.props.locations[0].lng)
					}
				}

				const { zoom } = this.map.props
				let size = {
					width: this.mapEl.offsetWidth,
					height: this.mapEl.offsetHeight
				}
				// set bounds pass through changeMap
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
				this.changeMap({ bounds: newBounds, center, zoom, size })
			}
		}
	}

	render() {
		let Pin = this.props.pin.component || this.props.pin
		let ClusterPin = this.props.clusterPin.component || this.props.clusterPin

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
					/>
				</div>
				<GoogleMap
					ref={ref => (this.map = ref)}
					onGoogleApiLoaded={this.handleMapLoad}
					bootstrapURLKeys={{ key: this.props.googleApiKey }}
					yesIWantToUseGoogleMapApiInternals
					center={this.props.center || center}
					zoom={this.props.zoom || zoom}
					options={this.createMapOptions}
					onChange={this.changeMap}
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
									pinProps={this.props.clusterPin.pinProps || null}
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
	clusterPin: ClusterPin,
	mapStyle: {},
	height: '800px',
	width: '100%'
}
