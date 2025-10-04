const FAQ = require('../Models/Faq_model');
const AboutUsModel = require('../Models/AboutUs_model');

//Get all FAQs
exports.getFAQs = async (req,res) => {
  try {
    const faqs = await FAQ.find({});
    res.status(200).json({
      content: faqs
    })
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error fetching FAQs' }),
    };
  }
};

//Get About Us content
exports.getAboutUs = async (req,res) => {
  try {
    const data = await AboutUsModel.find({});
    res.status(200).json({
      content: data
    })
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Content cant be displayed' }),
    };
  }
};
