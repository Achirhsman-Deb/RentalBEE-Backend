const Location = require('../Models/Locations_model');

exports.getAllLocations = async (req,res) => {
  try {
    const locations = await Location.find().lean();

    const formattedLocations = locations.map((location) => ({
      locationAddress: location.locationAddress,
      locationId: location._id.toString(),
      locationUrl: location.locationUrl,
      locationName: location.locationName,
    }));

    return res.status(200).json({
      content:formattedLocations
    })
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error fetching locations',
      }),
    };
  }
};
