function loadSceneView(){
	require([
		"esri/portal/Portal",
		"esri/identity/OAuthInfo",
		"esri/identity/IdentityManager",
		"esri/WebScene",
		"esri/views/SceneView",
		"esri/layers/GraphicsLayer",
		"esri/widgets/Sketch/SketchViewModel",
		"esri/widgets/Slider",
		"esri/geometry/geometryEngine",
		"esri/Graphic",
		"esri/core/promiseUtils"
	],function(Portal,OAuthInfo,esriId,WebScene,SceneView,GraphicsLayer,SketchViewModel,Slider,geometryEngine,Graphic,promiseUtils){
		
		var info = new OAuthInfo({
		  // Swap this ID out with registered application ID
		  appId: "9i1kCOvfh9sC96ys",
		  // Uncomment the next line and update if using your own portal
		  // portalUrl: "https://<host>:<port>/arcgis"
		  // Uncomment the next line to prevent the user's signed in state from being shared with other apps on the same domain with the same authNamespace value.
		  // authNamespace: "portal_oauth_inline",
		  popup: false
		});

		esriId.registerOAuthInfos([info]);
		
		var portal = new Portal();
		// Setting authMode to immediate signs the user in once loaded
		portal.authMode = "immediate";
		// Once loaded, user is signed in
		portal.load().then(function(){
			// Load webscene and display it in a SceneView
			const webscene = new WebScene({
			  portalItem: {
				id: "5e880009e61b408fba1d0be7758671f4"
			  }
			});
			// create the SceneView
			const view = new SceneView({
			  container: "viewDiv",
			  map: webscene,
			});
			window.view = view;
			// add a GraphicsLayer for the sketches and the buffer
			const sketchLayer = new GraphicsLayer();
			const bufferLayer = new GraphicsLayer();
			view.map.addMany([bufferLayer, sketchLayer]);

			let sceneLayer = null;
			let sceneLayerView = null;
			let bufferSize = 0;

			// Assign scene layer once webscene is loaded and initialize UI
			webscene.load().then(function() {

			  sceneLayer = webscene.layers.find(function(layer) {
				return layer.title === "F3514_16_2016_HarvestCorn_Raw_poly";
			  });
			  sceneLayer.outFields = ["DryYield","YieldWet","YieldMas","HarvestM","FuelRate"];

			  view.whenLayerView(sceneLayer).then(function (layerView) {
				sceneLayerView = layerView;
				queryDiv.style.display = "block";
			  });
			});

			view.ui.add([queryDiv], "bottom-left");
			view.ui.add([resultDiv], "top-right");

			// use SketchViewModel to draw polygons that are used as a query
			let sketchGeometry = null;
			const sketchViewModel = new SketchViewModel({
			  layer: sketchLayer,
			  defaultUpdateOptions: {
				tool: "reshape",
				toggleToolOnClick: false
			  },
			  view: view,
			  defaultCreateOptions: { hasZ: false }
			});

			sketchViewModel.on("create", function(event) {
			  if (event.state === "complete") {
				sketchGeometry = event.graphic.geometry;
				runQuery();
			  }
			});

			sketchViewModel.on("update", function(event) {
			  if (event.state === "complete") {
				sketchGeometry = event.graphics[0].geometry;
				runQuery();
			  }
			});
			// draw geometry buttons - use the selected geometry to sktech
			document
			  .getElementById("point-geometry-button")
			  .addEventListener("click", geometryButtonsClickHandler);
			document
			  .getElementById("line-geometry-button")
			  .addEventListener("click", geometryButtonsClickHandler);
			document
			  .getElementById("polygon-geometry-button")
			  .addEventListener("click", geometryButtonsClickHandler);
			function geometryButtonsClickHandler(event) {
			  const geometryType = event.target.value;
			  clearGeometry();
			  sketchViewModel.create(geometryType);
			}

			const bufferNumSlider = new Slider({
			  container: "bufferNum",
			  min: 0,
			  max: 500,
			  steps: 1,
			  visibleElements: {
				labels: true,
			  },
			  precision: 0,
			  labelFormatFunction: function(value, type) {
				return value.toString() + "m";
			  },
			  values: [0]
			});
			// get user entered values for buffer
			bufferNumSlider.on(["thumb-change", "thumb-drag"], bufferVariablesChanged);
			function bufferVariablesChanged(event) {
			  bufferSize = event.value;
			  runQuery();
			}
			// Clear the geometry and set the default renderer
			document
			  .getElementById("clearGeometry")
			  .addEventListener("click", clearGeometry);

			// Clear the geometry and set the default renderer
			function clearGeometry() {
			  sketchGeometry = null;
			  sketchViewModel.cancel();
			  sketchLayer.removeAll();
			  bufferLayer.removeAll();
			  clearHighlighting();
			  clearCharts();
			  resultDiv.style.display = "none";
			}

			// set the geometry query on the visible SceneLayerView
			var debouncedRunQuery = promiseUtils.debounce(function() {
			  if (!sketchGeometry) {
				return;
			  }

			  resultDiv.style.display = "block";
			  updateBufferGraphic(bufferSize);
			  return promiseUtils.eachAlways([
				queryStatistics(),
				updateSceneLayer()
			  ]);
			});

			function runQuery() {
			  debouncedRunQuery().catch((error) => {
				if (error.name === "AbortError") {
				  return;
				}

				console.error(error);
			  })
			}

			// Set the renderer with objectIds
			var highlightHandle = null;
			function clearHighlighting() {
			  if (highlightHandle) {
				highlightHandle.remove();
				highlightHandle = null;
			  }
			}

			function highlightBuildings(objectIds) {
			  // Remove any previous highlighting
			  clearHighlighting();
			  const objectIdField = sceneLayer.objectIdField;
			  document.getElementById("count").innerHTML = objectIds.length;

			  highlightHandle = sceneLayerView.highlight(objectIds);
			}

			// update the graphic with buffer
			function updateBufferGraphic(buffer) {

			  // add a polygon graphic for the buffer
			  if (buffer > 0) {
				var bufferGeometry = geometryEngine.geodesicBuffer(
				  sketchGeometry,
				  buffer,
				  "meters"
				);
				if (bufferLayer.graphics.length === 0) {
				  bufferLayer.add(
					new Graphic({
					  geometry: bufferGeometry,
					  symbol: sketchViewModel.polygonSymbol
					})
				  );
				} else {
				  bufferLayer.graphics.getItemAt(0).geometry = bufferGeometry;
				}
			  } else {
				bufferLayer.removeAll();
			  }
			}

			function updateSceneLayer() {
			  const query = sceneLayerView.createQuery();
			  query.geometry = sketchGeometry;
			  query.distance = bufferSize;
			  return sceneLayerView
				.queryObjectIds(query)
				.then(highlightBuildings);
			}

			var mcChart = null;
			var dyChart = null;
			var materialChart = null;

			function queryStatistics() {
			  const statDefinitions = [
				{
				  onStatisticField: "DryYield",
				  outStatisticFieldName: "DryYield_avg",
				  statisticType: "avg"
				},
				{
				  onStatisticField: "DryYield",
				  outStatisticFieldName: "DryYield_max",
				  statisticType: "max"
				},
				{
				  onStatisticField: "DryYield",
				  outStatisticFieldName: "DryYield_min",
				  statisticType: "min"
				},
				{
				  onStatisticField: "YieldWet",
				  outStatisticFieldName: "YieldWet_avg",
				  statisticType: "avg"
				},
				{
				  onStatisticField: "YieldMas",
				  outStatisticFieldName: "YieldMas_avg",
				  statisticType: "avg"
				},
				{
				  onStatisticField: "HarvestM",
				  outStatisticFieldName: "HarvestM_avg",
				  statisticType: "avg"
				},
				{
				  onStatisticField:	"HarvestM",
				  outStatisticFieldName: "HarvestM_max",
				  statisticType: "max"
				},
				{
				  onStatisticField: "HarvestM",
				  outStatisticFieldName: "HarvestM_min",
				  statisticType: "min"
				},
				{
				  onStatisticField:	"FuelRate",
				  outStatisticFieldName: "FuelRate_avg",
				  statisticType: "avg"
				},
				{
				  onStatisticField: "FuelRate",
				  outStatisticFieldName: "FuelRate_max",
				  statisticType: "max"
				},
				{
				  onStatisticField: "FuelRate",
				  outStatisticFieldName: "FuelRate_min",
				  statisticType: "min"
				}
			  ];
			  const query = sceneLayerView.createQuery();
			  query.geometry = sketchGeometry;
			  query.distance = bufferSize;
			  query.outStatistics = statDefinitions;

			  return sceneLayerView.queryFeatures(query).then(function(result) {
				const allStats = result.features[0].attributes;
				updateChart(mcChart, [
				  allStats.HarvestM_avg,
				  allStats.HarvestM_max,
				  allStats.HarvestM_min
				]);
				updateChart(dyChart, [
				  allStats.DryYield_avg,
				  allStats.DryYield_max,
				  allStats.DryYield_min
				]);
			  }, console.error);
			}

			// Updates the given chart with new data
			function updateChart(chart, dataValues) {
			  chart.data.datasets[0].data = dataValues;
			  chart.update();
			}

			function createChart(id, label, title, chart) {

			  const canvas = document.getElementById(id);
			  chart = new Chart(canvas.getContext("2d"), {
				type: "horizontalBar",
				data: {
				  labels: [
					"Average",
					"Maximum",
					"Minimum"
				  ],
				  datasets: [
					{
					  label: label,
					  backgroundColor: "#149dcf",
					  stack: "Stack 0",
					  data: [0, 0, 0, 0, 0, 0]
					}
				  ]
				},
				options: {
				  responsive: false,
				  legend: {
					display: false
				  },
				  title: {
					display: true,
					text: title
				  },
				  scales: {
					xAxes: [
					  {
						stacked: true,
						ticks: {
						  beginAtZero: true,
						  precision: 0
						}
					  }
					],
					yAxes: [
					  {
						stacked: true
					  }
					]
				  }
				}
			  });
			}
			//function createMaterialChart() {
			//  const yieldCanvas = document.getElementById("material-chart");
			//  yieldChart = new Chart(materialCanvas.getContext("2d"), {
			//	type: "doughnut",
			//	data: {
			//	  labels: ["Concrete", "Brick", "Wood", "Steel", "Other"],
			//	  datasets: [
			//		{
			//		  backgroundColor: [
			//			"#FD7F6F",
			//			"#7EB0D5",
			//			"#B2E061",
			//			"#BD7EBE",
			//			"#FFB55A"
			//		  ],
			//		  borderWidth: 0,
			//		  data: [0, 0, 0, 0, 0]
			//		}
			//	  ]
			//	},
			//	options: {
			//	  responsive: false,
			//	  cutoutPercentage: 35,
			//	  legend: {
			//		position: "bottom"
			//	  },
			//	  title: {
			//		display: true,
			//		text: "Building Material"
			//	  }
			//	}
			//  });
			//}

			function clearChart() {
			//  updateChart(materialChart, [0, 0, 0]);
			  updateChart(mcChart, [0, 0, 0]);
			  updateChart(dyChart, [0, 0, 0]);
			  document.getElementById("count").innerHTML = 0;
			}

			createChart("HarvMC-chart","MC %","Harvest Moisture Content",mcChart);
			createChart("HarvDY-chart","(bu/ac)","Dry Yield (bu/ac)", dyChart); 
			//createMaterialChart();
		});
	});
};
